const express = require('express');
const line = require('@line/bot-sdk');
const { v2: cloudinary } = require('cloudinary');
const app = express();
const port = process.env.PORT || 3000;

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const ADMIN_GROUP_ID = process.env.ADMIN_GROUP_ID;

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

const missing = [];
if (!config.channelAccessToken) missing.push('LINE_CHANNEL_ACCESS_TOKEN');
if (!config.channelSecret) missing.push('LINE_CHANNEL_SECRET');
if (!ADMIN_GROUP_ID) missing.push('ADMIN_GROUP_ID');
if (!CLOUDINARY_CLOUD_NAME) missing.push('CLOUDINARY_CLOUD_NAME');
if (!CLOUDINARY_API_KEY) missing.push('CLOUDINARY_API_KEY');
if (!CLOUDINARY_API_SECRET) missing.push('CLOUDINARY_API_SECRET');

if (missing.length > 0) {
  console.warn(`Missing environment variables: ${missing.join(', ')}`);
}

const client = new line.Client(config);
cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});
// In-memory state per userId
const sessions = new Map();

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const SERVICES = [
  'ตัดผมชาย',
  'ทำเล็บ',
  'ต่อเล็บ',
  'ทำสีผม',
  'ดัดผม',
  'สระ/ไดร์',
  'ทรีตเมนต์',
  'สักลาย',
  'สอบถามราคา',
  'จองคิว',
  'เปลี่ยนวันนัด',
  'ติดต่อแอดมิน',
  'จองคิวเพิ่มเติม',
  'คุยกับพนักงาน/เช็กคิวเดิม',
];

const RESTART_KEYWORDS = ['เริ่มใหม่', 'เริ่มต้นใหม่', 'เริ่มใหม่อีกครั้ง', 'start', 'restart', 'เมนู', 'menu'];
const RESCHEDULE_KEYWORDS = ['เปลี่ยนวันนัด', 'เลื่อนนัด'];
const CONTACT_ADMIN_KEYWORDS = ['ติดต่อแอดมิน', 'คุยกับแอดมิน', 'แอดมิน'];
const OLD_CASE_KEYWORDS = ['คุยกับพนักงาน/เช็กคิวเดิม', 'คุยกับพนักงาน', 'เช็กคิวเดิม', 'คิวเดิม'];
const EXTRA_BOOKING_KEYWORDS = ['จองคิวเพิ่มเติม', 'จองเพิ่ม', 'จองใหม่'];
const START_TRIGGER_KEYWORDS = [
  'เมนู',
  'menu',
  'เริ่มใหม่',
  'เริ่มต้นใหม่',
  'start',
  'restart',
  'จองคิว',
  'จองคิวเพิ่มเติม',
  'จองเพิ่ม',
  'จองใหม่',
  'สอบถามราคา',
  'เปลี่ยนวันนัด',
  'เลื่อนนัด',
  'ติดต่อแอดมิน',
  'คุยกับพนักงาน',
  'คุยกับพนักงาน/เช็กคิวเดิม',
  'เช็กคิวเดิม',
  'คิวเดิม',
  'สวัสดี',
  'สวัสดีค่ะ',
  'สวัสดีครับ',
  'hello',
  'hi',
  'หวัดดี',
];

const CLOSED_WINDOW_MS = 24 * 60 * 60 * 1000;
const TATTOO_REFERENCE_LINK = 'https://linevoom.line.me/post/1177332387036083141';

app.get('/', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'beauty-salon-line-bot',
    message: 'LINE webhook is running',
    publicBaseUrl: PUBLIC_BASE_URL || '(not set)',
  });
});

app.get('/uploads/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOAD_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  const ext = path.extname(filename).toLowerCase();

  if (ext === '.png') {
    res.type('png');
  } else if (ext === '.gif') {
    res.type('gif');
  } else if (ext === '.webp') {
    res.type('webp');
  } else {
    res.type('jpeg');
  }

  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Content-Disposition', 'inline');

  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('sendFile error:', err);
      if (!res.headersSent) {
        res.status(500).send('Error serving file');
      }
    }
  });
});

app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    const results = await Promise.all((req.body.events || []).map(handleEvent));
    res.status(200).json({ ok: true, results });
  } catch (error) {
    console.error('Webhook error:', JSON.stringify(error?.originalError?.response?.data || error?.body || error, null, 2));
    res.status(500).end();
  }
});

async function handleEvent(event) {
  if (event.source?.type === 'group' && event.source?.groupId) {
    console.log('GROUP ID:', event.source.groupId);
  }

  if (event.type !== 'message') return null;

  if (event.message.type === 'text') {
    return handleTextMessage(event);
  }

  if (event.message.type === 'image') {
    return handleImageMessage(event);
  }

  return null;
}

async function handleTextMessage(event) {
  const userId = event.source.userId;
  const replyToken = event.replyToken;
  const incomingText = (event.message.text || '').trim();
  const normalized = normalizeText(incomingText);

  if (!userId) {
    await replyText(replyToken, 'ขออภัยค่ะ ระบบไม่สามารถระบุผู้ใช้งานได้ในขณะนี้');
    return null;
  }

  let isFirstMessage = false;

  if (!sessions.has(userId)) {
    sessions.set(userId, createDefaultSession());
    isFirstMessage = true;
  }

  const session = sessions.get(userId);
  session.lastSeenAt = Date.now();

  if (session.mode === 'closed') {
    const passed = Date.now() - (session.closedAt || 0);

    if (passed >= CLOSED_WINDOW_MS) {
      sessions.set(userId, createDefaultSession());
      const freshSession = sessions.get(userId);
      freshSession.mode = 'reopenMenu';
      freshSession.step = 'chooseAction';

      await replyMessages(replyToken, [buildReopenMenuMessage()]);
      return 'reopen_menu_after_24h';
    }

    if (isStartTrigger(normalized, incomingText)) {
      sessions.set(userId, createDefaultSession());
      const freshSession = sessions.get(userId);

      if (OLD_CASE_KEYWORDS.includes(incomingText) || OLD_CASE_KEYWORDS.includes(normalized)) {
        await pushToAdminGroup(buildOldCaseSummary(event, incomingText));
        markConversationClosed(userId);
        await replyText(replyToken, 'รับเรื่องเรียบร้อยแล้วค่ะ ทางร้านจะตรวจสอบคิวเดิมหรือให้พนักงานติดต่อกลับอีกครั้งนะคะ');
        return 'closed_old_case_trigger';
      }

      if (RESCHEDULE_KEYWORDS.includes(normalized)) {
        sessions.set(userId, {
          mode: 'reschedule',
          step: 'nameOrPhone',
          data: { requestType: 'เปลี่ยนวันนัด' },
          closedAt: null,
          lastSeenAt: Date.now(),
        });

        await replyText(replyToken, 'ได้เลยค่ะ กรุณาแจ้งชื่อหรือเบอร์โทรที่ใช้จองไว้ เพื่อให้ทางร้านตรวจสอบข้อมูลให้ค่ะ');
        return 'closed_restart_reschedule';
      }

      if (CONTACT_ADMIN_KEYWORDS.includes(normalized)) {
        await pushToAdminGroup(buildContactAdminSummary(event, incomingText));
        markConversationClosed(userId);
        await replyText(replyToken, 'รับเรื่องเรียบร้อยแล้วค่ะ ทางร้านจะติดต่อกลับเร็วที่สุดนะคะ');
        return 'closed_contact_admin';
      }

      if (
        EXTRA_BOOKING_KEYWORDS.includes(incomingText) ||
        EXTRA_BOOKING_KEYWORDS.includes(normalized) ||
        incomingText === 'จองคิว'
      ) {
        freshSession.mode = 'booking';
        freshSession.step = 'service';
        freshSession.data = {};
        await replyText(replyToken, 'ต้องการจองคิวเพิ่มเติมสำหรับบริการไหนคะ กรุณาระบุบริการที่ต้องการได้เลยค่ะ');
        return 'closed_extra_booking';
      }

      if (incomingText === 'สอบถามราคา' || normalized === 'สอบถามราคา') {
        freshSession.mode = 'priceInquiry';
        freshSession.step = 'choosePriceService';
        freshSession.data = {};
        await replyMessages(replyToken, [buildPriceInquiryMenuMessage()]);
        return 'closed_price_inquiry';
      }

      freshSession.mode = 'booking';
      freshSession.step = 'service';
      await replyMessages(replyToken, [buildWelcomeMessage(), buildServiceQuestion()]);
      return 'closed_restart_general';
    }

    return 'closed_ignore';
  }

  if (session.mode === 'reopenMenu') {
    if (OLD_CASE_KEYWORDS.includes(incomingText) || OLD_CASE_KEYWORDS.includes(normalized)) {
      await pushToAdminGroup(buildOldCaseSummary(event, incomingText));
      markConversationClosed(userId);
      await replyText(replyToken, 'รับเรื่องเรียบร้อยแล้วค่ะ ทางร้านจะตรวจสอบคิวเดิมหรือให้พนักงานติดต่อกลับอีกครั้งนะคะ');
      return 'reopen_old_case';
    }

    if (EXTRA_BOOKING_KEYWORDS.includes(incomingText) || EXTRA_BOOKING_KEYWORDS.includes(normalized)) {
      sessions.set(userId, {
        mode: 'booking',
        step: 'service',
        data: {},
        closedAt: null,
        lastSeenAt: Date.now(),
      });
      await replyText(replyToken, 'ต้องการจองคิวเพิ่มเติมสำหรับบริการไหนคะ กรุณาระบุบริการที่ต้องการได้เลยค่ะ');
      return 'reopen_extra_booking';
    }

    if (RESCHEDULE_KEYWORDS.includes(normalized)) {
      sessions.set(userId, {
        mode: 'reschedule',
        step: 'nameOrPhone',
        data: { requestType: 'เปลี่ยนวันนัด' },
        closedAt: null,
        lastSeenAt: Date.now(),
      });

      await replyText(replyToken, 'ได้เลยค่ะ กรุณาแจ้งชื่อหรือเบอร์โทรที่ใช้จองไว้ เพื่อให้ทางร้านตรวจสอบข้อมูลให้ค่ะ');
      return 'reopen_reschedule';
    }

    if (incomingText === 'สอบถามราคา') {
      sessions.set(userId, {
        mode: 'priceInquiry',
        step: 'choosePriceService',
        data: {},
        closedAt: null,
        lastSeenAt: Date.now(),
      });
      await replyMessages(replyToken, [buildPriceInquiryMenuMessage()]);
      return 'reopen_price_inquiry';
    }

    sessions.set(userId, {
      mode: 'booking',
      step: 'service',
      data: {},
      closedAt: null,
      lastSeenAt: Date.now(),
    });
    await replyMessages(replyToken, [buildReopenMenuMessage()]);
    return 'reopen_menu_repeat';
  }

  if (RESTART_KEYWORDS.includes(normalized)) {
    sessions.set(userId, {
      mode: 'booking',
      step: 'service',
      data: {},
      closedAt: null,
      lastSeenAt: Date.now(),
    });

    await replyMessages(replyToken, [buildWelcomeMessage(), buildServiceQuestion()]);
    return 'restarted';
  }

  if (CONTACT_ADMIN_KEYWORDS.includes(normalized)) {
    await pushToAdminGroup(buildContactAdminSummary(event, incomingText));
    markConversationClosed(userId);
    await replyText(replyToken, 'รับเรื่องเรียบร้อยแล้วค่ะ ทางร้านจะติดต่อกลับเร็วที่สุด หากต้องการฝากรายละเอียดเพิ่มเติม สามารถพิมพ์ส่งมาได้เลยนะคะ');
    return 'contact_admin';
  }

  if (OLD_CASE_KEYWORDS.includes(incomingText) || OLD_CASE_KEYWORDS.includes(normalized)) {
    await pushToAdminGroup(buildOldCaseSummary(event, incomingText));
    markConversationClosed(userId);
    await replyText(replyToken, 'รับเรื่องเรียบร้อยแล้วค่ะ ทางร้านจะตรวจสอบคิวเดิมหรือให้พนักงานติดต่อกลับอีกครั้งนะคะ');
    return 'old_case';
  }

  if (RESCHEDULE_KEYWORDS.includes(normalized)) {
    sessions.set(userId, {
      mode: 'reschedule',
      step: 'nameOrPhone',
      data: { requestType: 'เปลี่ยนวันนัด' },
      closedAt: null,
      lastSeenAt: Date.now(),
    });

    await replyText(replyToken, 'ได้เลยค่ะ กรุณาแจ้งชื่อหรือเบอร์โทรที่ใช้จองไว้ เพื่อให้ทางร้านตรวจสอบข้อมูลให้ค่ะ');
    return 'start_reschedule';
  }

  if (EXTRA_BOOKING_KEYWORDS.includes(incomingText) || EXTRA_BOOKING_KEYWORDS.includes(normalized)) {
    sessions.set(userId, {
      mode: 'booking',
      step: 'service',
      data: {},
      closedAt: null,
      lastSeenAt: Date.now(),
    });

    await replyText(replyToken, 'ต้องการจองคิวเพิ่มเติมสำหรับบริการไหนคะ กรุณาระบุบริการที่ต้องการได้เลยค่ะ');
    return 'start_extra_booking';
  }

  if (incomingText === 'สอบถามราคา' || normalized === 'สอบถามราคา') {
    sessions.set(userId, {
      mode: 'priceInquiry',
      step: 'choosePriceService',
      data: {},
      closedAt: null,
      lastSeenAt: Date.now(),
    });

    await replyMessages(replyToken, [buildPriceInquiryMenuMessage()]);
    return 'start_price_inquiry';
  }

  if (session.mode === 'idle') {
    if (isFirstMessage) {
      sessions.set(userId, {
        mode: 'booking',
        step: 'service',
        data: {},
        closedAt: null,
        lastSeenAt: Date.now(),
      });

      if (SERVICES.includes(incomingText) && incomingText !== 'สอบถามราคา') {
        return handleBookingFlow(event, incomingText, userId);
      }

      if (incomingText === 'สอบถามราคา') {
        sessions.set(userId, {
          mode: 'priceInquiry',
          step: 'choosePriceService',
          data: {},
          closedAt: null,
          lastSeenAt: Date.now(),
        });
        await replyMessages(replyToken, [buildPriceInquiryMenuMessage()]);
        return 'first_price_inquiry';
      }

      await replyMessages(replyToken, [buildWelcomeMessage(), buildServiceQuestion()]);
      return 'first_welcome';
    }

    if (SERVICES.includes(incomingText) && incomingText !== 'สอบถามราคา') {
      sessions.set(userId, {
        mode: 'booking',
        step: 'service',
        data: {},
        closedAt: null,
        lastSeenAt: Date.now(),
      });
      return handleBookingFlow(event, incomingText, userId);
    }

    if (incomingText === 'สอบถามราคา' || normalized === 'สอบถามราคา') {
      sessions.set(userId, {
        mode: 'priceInquiry',
        step: 'choosePriceService',
        data: {},
        closedAt: null,
        lastSeenAt: Date.now(),
      });
      await replyMessages(replyToken, [buildPriceInquiryMenuMessage()]);
      return 'idle_price_triggered';
    }

    if (isStartTrigger(normalized, incomingText)) {
      sessions.set(userId, {
        mode: 'booking',
        step: 'service',
        data: {},
        closedAt: null,
        lastSeenAt: Date.now(),
      });

      await replyMessages(replyToken, [buildWelcomeMessage(), buildServiceQuestion()]);
      return 'idle_triggered';
    }

    sessions.set(userId, {
      mode: 'booking',
      step: 'service',
      data: {},
      closedAt: null,
      lastSeenAt: Date.now(),
    });

    await replyMessages(replyToken, [buildWelcomeMessage(), buildServiceQuestion()]);
    return 'idle_fallback_to_menu';
  }

  if (session.mode === 'booking') {
    return handleBookingFlow(event, incomingText, userId);
  }

  if (session.mode === 'priceInquiry') {
    return handlePriceInquiryFlow(event, incomingText, userId);
  }

  if (session.mode === 'reschedule') {
    return handleRescheduleFlow(event, incomingText, userId);
  }

  sessions.set(userId, createDefaultSession());
  return 'fallback_reset';
}

async function handleImageMessage(event) {
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  if (!userId) {
    await replyText(replyToken, 'ขออภัยค่ะ ระบบไม่สามารถระบุผู้ใช้งานได้ในขณะนี้');
    return null;
  }

  if (!sessions.has(userId)) {
    sessions.set(userId, createDefaultSession());
  }

  const session = sessions.get(userId);
  session.lastSeenAt = Date.now();

  if (session.mode !== 'booking') {
    await replyText(replyToken, 'ได้รับรูปเรียบร้อยแล้วค่ะ\nหากต้องการเริ่มจองคิว กรุณาพิมพ์ “เมนู” หรือเลือกบริการที่ต้องการได้เลยนะคะ');
    return 'image_outside_booking';
  }

  if (!['tattooNeedPhoto', 'tattooChooseDesign', 'samplePhoto'].includes(session.step)) {
    await replyText(replyToken, 'ได้รับรูปเรียบร้อยแล้วค่ะ\nหากต้องการแนบรูปประกอบเพิ่มเติม รบกวนแจ้งรายละเอียดต่อได้เลยนะคะ');
    return 'image_unexpected_booking';
  }

  try {
    const saved = await saveIncomingImage(event.message.id);

    if (!session.data.images) session.data.images = [];
    session.data.images.push(saved);

    if (session.step === 'tattooNeedPhoto') {
      session.step = 'tattooChooseDesign';

      await replyMessages(replyToken, [
        {
          type: 'text',
          text: `ได้รับรูปเรียบร้อยแล้วค่ะ\nสามารถเข้าไปดูลายเพิ่มเติมได้ที่ลิงก์นี้เลยนะคะ\n${TATTOO_REFERENCE_LINK}`,
        },
        {
          type: 'text',
          text: 'เช็กลายที่ต้องการได้เลยค่ะ\nหากมีลายที่นำมาเอง สามารถส่งรูปเพิ่มเข้ามาได้เลยนะคะ\nเมื่อพร้อมแล้ว พิมพ์รายละเอียดลาย/ตำแหน่ง/ขนาดที่ต้องการมาได้เลยค่ะ',
        },
      ]);
      return 'tattoo_first_image_saved';
    }

    if (session.step === 'tattooChooseDesign') {
      await replyText(replyToken, 'ได้รับรูปเพิ่มเติมเรียบร้อยแล้วค่ะ\nรบกวนพิมพ์ลายที่ต้องการ ตำแหน่งที่จะสัก และขนาดโดยประมาณได้เลยนะคะ');
      return 'tattoo_extra_image_saved';
    }

    if (session.step === 'samplePhoto') {
      session.data.samplePhoto = 'มีรูปตัวอย่างแล้ว';
      session.step = 'preferredStaff';
      await replyText(replyToken, 'ได้รับรูปตัวอย่างเรียบร้อยแล้วค่ะ\nต้องการช่างคนไหนเป็นพิเศษไหมคะ ถ้าไม่มีสามารถพิมพ์ว่า “ได้ทุกท่าน” ได้เลยค่ะ');
      return 'sample_photo_saved';
    }

    return 'image_saved';
  } catch (error) {
    console.error('handleImageMessage error:', JSON.stringify(error?.originalError?.response?.data || error?.body || error, null, 2));
    await replyText(replyToken, 'ขออภัยค่ะ ระบบบันทึกรูปไม่สำเร็จ รบกวนส่งรูปอีกครั้งได้เลยนะคะ');
    return 'image_save_failed';
  }
}

async function handleBookingFlow(event, text, userId) {
  const session = sessions.get(userId);
  const replyToken = event.replyToken;

  switch (session.step) {
    case 'service': {
      session.data.service = text;

      if (text === 'สอบถามราคา') {
        session.mode = 'priceInquiry';
        session.step = 'choosePriceService';
        session.data = {};
        await replyMessages(replyToken, [buildPriceInquiryMenuMessage()]);
        return 'service_to_price_inquiry';
      }

      if (text === 'เปลี่ยนวันนัด') {
        sessions.set(userId, {
          mode: 'reschedule',
          step: 'nameOrPhone',
          data: { requestType: 'เปลี่ยนวันนัด' },
          closedAt: null,
          lastSeenAt: Date.now(),
        });
        await replyText(replyToken, 'ได้เลยค่ะ กรุณาแจ้งชื่อหรือเบอร์โทรที่ใช้จองไว้ เพื่อให้ทางร้านตรวจสอบข้อมูลให้ค่ะ');
        return 'service_to_reschedule';
      }

      if (text === 'ติดต่อแอดมิน') {
        await pushToAdminGroup(buildContactAdminSummary(event, text));
        markConversationClosed(userId);
        await replyText(replyToken, 'รับเรื่องเรียบร้อยแล้วค่ะ ทางร้านจะติดต่อกลับเร็วที่สุดนะคะ');
        return 'service_contact_admin';
      }

      if (text === 'คุยกับพนักงาน/เช็กคิวเดิม') {
        await pushToAdminGroup(buildOldCaseSummary(event, text));
        markConversationClosed(userId);
        await replyText(replyToken, 'รับเรื่องเรียบร้อยแล้วค่ะ ทางร้านจะตรวจสอบคิวเดิมหรือให้พนักงานติดต่อกลับอีกครั้งนะคะ');
        return 'service_old_case';
      }

      if (text === 'จองคิว' || text === 'จองคิวเพิ่มเติม') {
        session.step = 'style';
        await replyText(replyToken, 'ต้องการจองสำหรับบริการไหนคะ กรุณาระบุบริการที่ต้องการได้เลยค่ะ');
        return 'service_booking_general';
      }

      if (text === 'สักลาย') {
        session.step = 'tattooNeedPhoto';
        session.data.images = [];
        await replyText(replyToken, 'สำหรับบริการสักลาย รบกวนส่งรูปที่ต้องการให้ร้านดูก่อน 1 รูปได้เลยค่ะ\nเช่น รูปบริเวณที่จะสัก หรือรูปอ้างอิงเบื้องต้น');
        return 'ask_tattoo_first_photo';
      }

      session.step = 'style';
      await replyText(replyToken, buildDetailQuestion(text));
      return 'ask_style';
    }

    case 'tattooNeedPhoto':
      await replyText(replyToken, 'รบกวนส่งรูปก่อนนะคะ เพื่อให้ทางร้านดูรายละเอียดเบื้องต้นก่อนค่ะ');
      return 'tattoo_waiting_image';

    case 'tattooChooseDesign':
      session.data.style = text;
      session.step = 'name';
      await replyText(replyToken, 'ขอทราบชื่อสำหรับการจองหน่อยค่ะ');
      return 'tattoo_style_to_name';

    case 'style':
      session.data.style = text;
      session.step = 'samplePhoto';
      await replyText(replyToken, 'มีรูปตัวอย่างไหมคะ ถ้ามีสามารถส่งรูปมาได้เลย หรือถ้าไม่มีให้พิมพ์ว่า “ไม่มีค่ะ” ได้เลยค่ะ');
      return 'ask_sample_photo';

    case 'samplePhoto':
      session.data.samplePhoto = text;
      session.step = 'preferredStaff';
      await replyText(replyToken, 'ต้องการช่างคนไหนเป็นพิเศษไหมคะ ถ้าไม่มีสามารถพิมพ์ว่า “ได้ทุกท่าน” ได้เลยค่ะ');
      return 'ask_staff';

    case 'preferredStaff':
      session.data.preferredStaff = text;
      session.step = 'name';
      await replyText(replyToken, 'ขอทราบชื่อสำหรับการจองหน่อยค่ะ');
      return 'ask_name';

    case 'name':
      session.data.name = text;
      session.step = 'phone';
      await replyText(replyToken, 'ขอเบอร์โทรติดต่อกลับด้วยค่ะ');
      return 'ask_phone';

    case 'phone':
      session.data.phone = text;
      session.step = 'preferredDate';
      await replyText(replyToken, 'สะดวกวันไหนคะ สามารถพิมพ์เป็นวันที่หรือช่วงวันที่ที่สะดวกได้เลยค่ะ');
      return 'ask_preferred_date';

    case 'preferredDate':
      session.data.preferredDate = text;
      session.step = 'preferredTime';
      await replyText(replyToken, 'สะดวกช่วงเวลาไหนคะ เช่น 10:00 น. / ช่วงบ่าย / หลังเลิกงาน');
      return 'ask_preferred_time';

    case 'preferredTime':
      session.data.preferredTime = text;
      session.step = 'additionalDetails';
      await replyText(replyToken, 'มีรายละเอียดเพิ่มเติมไหมคะ เช่น ขนาด จุดที่ต้องการสัก ความยาวผม สีที่อยากได้ ลายเล็บ งบประมาณ หรือข้อมูลอื่น ๆ');
      return 'ask_additional';

    case 'additionalDetails': {
  session.data.additionalDetails = text;
  const adminSummary = buildSummaryForAdmin(event, session.data);

  await pushToAdminGroup(adminSummary);

  markConversationClosed(userId);

  await replyText(replyToken, 'ทางร้านได้รับข้อมูลเรียบร้อยแล้ว เดี๋ยวแอดมินหรือช่างจะติดต่อกลับเพื่อยืนยันวันและเวลาที่แน่ชัดอีกครั้งนะคะ');
  return 'booking_completed';
}

    default:
      sessions.set(userId, createDefaultSession());
      await replyMessages(replyToken, [buildWelcomeMessage(), buildServiceQuestion()]);
      return 'booking_reset';
  }
}

async function handlePriceInquiryFlow(event, text, userId) {
  const session = sessions.get(userId);
  const replyToken = event.replyToken;

  switch (session.step) {
    case 'choosePriceService': {
      const selectedService = normalizePriceService(text);

      if (!selectedService) {
        await replyMessages(replyToken, [
          buildPriceInquiryMenuMessage(),
          { type: 'text', text: 'กรุณาเลือกบริการที่ต้องการสอบถามราคาจากเมนูได้เลยค่ะ' },
        ]);
        return 'price_choose_invalid';
      }

      session.data.priceService = selectedService;

      await replyMessages(replyToken, [
        buildPriceResponseMessage(selectedService),
        {
          type: 'text',
          text: 'หากต้องการจองคิวหรือสอบถามเพิ่มเติม สามารถเลือกเมนูด้านล่างได้เลยค่ะ',
          quickReply: {
            items: [
              quickReplyText('จองคิว'),
              quickReplyText('สอบถามราคา'),
              quickReplyText('ติดต่อแอดมิน'),
              quickReplyText('เมนู'),
            ],
          },
        },
      ]);

      markConversationClosed(userId);
      return 'price_completed';
    }

    default:
      sessions.set(userId, createDefaultSession());
      await replyMessages(replyToken, [buildWelcomeMessage(), buildServiceQuestion()]);
      return 'price_reset';
  }
}

async function handleRescheduleFlow(event, text, userId) {
  const session = sessions.get(userId);
  const replyToken = event.replyToken;

  switch (session.step) {
    case 'nameOrPhone':
      session.data.nameOrPhone = text;
      session.step = 'newDate';
      await replyText(replyToken, 'รบกวนแจ้งวันที่ใหม่ที่สะดวกด้วยค่ะ');
      return 'reschedule_new_date';

    case 'newDate':
      session.data.newDate = text;
      session.step = 'newTime';
      await replyText(replyToken, 'รบกวนแจ้งเวลาที่สะดวกด้วยค่ะ');
      return 'reschedule_new_time';

    case 'newTime': {
      session.data.newTime = text;
      const adminSummary = buildRescheduleSummary(event, session.data);
      await pushToAdminGroup(adminSummary);
      markConversationClosed(userId);

      await replyText(replyToken, 'ทางร้านได้รับข้อมูลเรียบร้อยแล้ว เดี๋ยวแอดมินหรือช่างจะติดต่อกลับเพื่อยืนยันวันและเวลาที่แน่ชัดอีกครั้งนะคะ');
      return 'reschedule_completed';
    }

    default:
      sessions.set(userId, createDefaultSession());
      await replyMessages(replyToken, [buildWelcomeMessage(), buildServiceQuestion()]);
      return 'reschedule_reset';
  }
}

function buildWelcomeMessage() {
  return {
    type: 'text',
    text: 'สวัสดีค่ะ ยินดีต้อนรับสู่ร้าน Beauty Salon ✨\nทางร้านยินดีให้ข้อมูลเรื่องบริการ ราคา การจองคิว และการเปลี่ยนวันนัดค่ะ',
    quickReply: {
      items: [
        quickReplyText('จองคิว'),
        quickReplyText('สอบถามราคา'),
        quickReplyText('เปลี่ยนวันนัด'),
        quickReplyText('ติดต่อแอดมิน'),
      ],
    },
  };
}

function buildServiceQuestion() {
  return {
    type: 'text',
    text: 'ต้องการใช้บริการอะไรคะ กรุณาเลือกจากเมนูด้านล่างได้เลยค่ะ',
    quickReply: {
      items: [
        quickReplyText('ตัดผมชาย'),
        quickReplyText('ทำเล็บ'),
        quickReplyText('ต่อเล็บ'),
        quickReplyText('ทำสีผม'),
        quickReplyText('ดัดผม'),
        quickReplyText('สระ/ไดร์'),
        quickReplyText('ทรีตเมนต์'),
        quickReplyText('สักลาย'),
        quickReplyText('สอบถามราคา'),
        quickReplyText('เปลี่ยนวันนัด'),
        quickReplyText('ติดต่อแอดมิน'),
      ],
    },
  };
}

function buildReopenMenuMessage() {
  return {
    type: 'text',
    text: 'สวัสดีค่ะ ยินดีต้อนรับกลับนะคะ\nหากเป็นเรื่องคิวเดิมหรืออยากคุยกับพนักงาน สามารถเลือก “คุยกับพนักงาน/เช็กคิวเดิม” ได้เลยค่ะ\nหากต้องการจองใหม่หรือจองเพิ่ม เลือก “จองคิวเพิ่มเติม” ได้เลยนะคะ',
    quickReply: {
      items: [
        quickReplyText('คุยกับพนักงาน/เช็กคิวเดิม'),
        quickReplyText('จองคิวเพิ่มเติม'),
        quickReplyText('เปลี่ยนวันนัด'),
        quickReplyText('สอบถามราคา'),
      ],
    },
  };
}

function buildPriceInquiryMenuMessage() {
  return {
    type: 'text',
    text: 'ต้องการสอบถามราคาบริการไหนคะ กรุณาเลือกจากเมนูด้านล่างได้เลยค่ะ',
    quickReply: {
      items: [
        quickReplyText('ราคาตัดผมชาย'),
        quickReplyText('ราคาทำเล็บ'),
        quickReplyText('ราคาต่อเล็บ'),
        quickReplyText('ราคาทำสีผม'),
        quickReplyText('ราคาดัดผม'),
        quickReplyText('ราคาสระ/ไดร์'),
        quickReplyText('ราคาทรีตเมนต์'),
        quickReplyText('ราคาสักลาย'),
      ],
    },
  };
}

function normalizePriceService(text) {
  const value = normalizeText(text);

  const map = {
    'ราคาตัดผมชาย': 'ตัดผมชาย',
    'ตัดผมชาย': 'ตัดผมชาย',
    'ราคาทำเล็บ': 'ทำเล็บ',
    'ทำเล็บ': 'ทำเล็บ',
    'ราคาต่อเล็บ': 'ต่อเล็บ',
    'ต่อเล็บ': 'ต่อเล็บ',
    'ราคาทำสีผม': 'ทำสีผม',
    'ทำสีผม': 'ทำสีผม',
    'ราคาดัดผม': 'ดัดผม',
    'ดัดผม': 'ดัดผม',
    'ราคาสระ/ไดร์': 'สระ/ไดร์',
    'สระ/ไดร์': 'สระ/ไดร์',
    'สระไดร์': 'สระ/ไดร์',
    'ราคาทรีตเมนต์': 'ทรีตเมนต์',
    'ทรีตเมนต์': 'ทรีตเมนต์',
    'ราคาสักลาย': 'สักลาย',
    'สักลาย': 'สักลาย',
  };

  return map[value] || null;
}

function getSamplePriceData(service) {
  const priceMap = {
    'ตัดผมชาย': {
      price: 'เริ่มต้น 250 บาท',
      details: 'ตัด + ซอย + เซ็ตทรง',
    },
    'ทำเล็บ': {
      price: 'เริ่มต้น 300 บาท',
      details: 'ขึ้นอยู่กับแบบและสีที่เลือก',
    },
    'ต่อเล็บ': {
      price: 'เริ่มต้น 799 บาท',
      details: 'ขึ้นอยู่กับความยาว ทรง และลายที่ต้องการ',
    },
    'ทำสีผม': {
      price: 'เริ่มต้น 1,290 บาท',
      details: 'ขึ้นอยู่กับความยาวผม สีเดิม และสีที่ต้องการ',
    },
    'ดัดผม': {
      price: 'เริ่มต้น 1,590 บาท',
      details: 'ขึ้นอยู่กับความยาวผมและรูปแบบลอน',
    },
    'สระ/ไดร์': {
      price: 'เริ่มต้น 199 บาท',
      details: 'ไดร์ตรง / ไดร์ลอน ราคาต่างกันเล็กน้อย',
    },
    'ทรีตเมนต์': {
      price: 'เริ่มต้น 490 บาท',
      details: 'ขึ้นอยู่กับสูตรที่เลือกและสภาพเส้นผม',
    },
    'สักลาย': {
      price: 'เริ่มต้น 999 บาท',
      details: 'ขึ้นอยู่กับขนาด ตำแหน่ง และความละเอียดของลาย',
    },
  };

  return priceMap[service] || {
    price: 'กรุณาสอบถามเพิ่มเติม',
    details: 'รายละเอียดราคาอาจเปลี่ยนแปลงตามบริการ',
  };
}

function buildPriceResponseMessage(service) {
  const priceData = getSamplePriceData(service);

  return {
    type: 'text',
    text:
      `💬 ราคาบริการ ${service}\n` +
      `ราคา: ${priceData.price}\n` +
      `รายละเอียด: ${priceData.details}\n\n` +
      `หมายเหตุ: ราคานี้เป็นราคาเบื้องต้นนะคะ ราคาอาจเปลี่ยนได้ตามรายละเอียดหน้างานค่ะ`,
  };
}

function buildDetailQuestion(service) {
  const map = {
    'ตัดผมชาย': 'ต้องการทรงหรือสไตล์แบบไหนคะ และต้องการช่างคนไหนเป็นพิเศษไหม',
    'ทำเล็บ': 'ต้องการทำเล็บแบบไหนคะ เช่น ทาสีเจล สปามือ หรือดูแลเล็บ พร้อมแจ้งลายหรือโทนสีที่ต้องการได้เลยค่ะ',
    'ต่อเล็บ': 'ต้องการต่อเล็บแบบไหนคะ เช่น ต่อเจล ต่ออะคริลิก และอยากได้ทรง/ลายแบบไหนคะ',
    'ทำสีผม': 'ต้องการทำสีผมโทนไหนคะ และผมปัจจุบันยาวประมาณไหน หรือเคยผ่านการทำสีมาก่อนไหมคะ',
    'ดัดผม': 'ต้องการดัดผมแบบไหนคะ เช่น ลอนคลาย ลอนแน่น และผมยาวประมาณไหนคะ',
    'สระ/ไดร์': 'ต้องการสระ/ไดร์แบบไหนคะ เช่น ไดร์ตรง ไดร์ลอน หรือมีโอกาสพิเศษไหมคะ',
    'ทรีตเมนต์': 'ต้องการทรีตเมนต์แบบไหนคะ หรือมีปัญหาเส้นผม/หนังศีรษะที่อยากดูแลเป็นพิเศษไหมคะ',
    'สักลาย': 'รบกวนส่งรูปมาก่อนได้เลยค่ะ',
    'จองคิว': 'ต้องการจองคิวสำหรับบริการไหนคะ กรุณาระบุบริการที่ต้องการได้เลยค่ะ',
    'จองคิวเพิ่มเติม': 'ต้องการจองคิวเพิ่มเติมสำหรับบริการไหนคะ กรุณาระบุบริการที่ต้องการได้เลยค่ะ',
  };

  return map[service] || 'รบกวนแจ้งรายละเอียดบริการที่ต้องการได้เลยค่ะ';
}

function buildSummaryForAdmin(event, data) {
  const source = event.source || {};
  const images = data.images || [];
  const imageLines = images.length
    ? images.map((img, index) => `รูปที่ ${index + 1}: ${img.url}`).join('\n')
    : '-';

  return [
    '📌 มีลูกค้าส่งข้อมูลเข้ามาใหม่',
    'ประเภทคำขอ: จอง/สอบถามบริการ',
    `บริการ: ${safeValue(data.service)}`,
    `แบบ/รายละเอียดที่ต้องการ: ${safeValue(data.style)}`,
    `มีรูปตัวอย่างไหม: ${safeValue(data.samplePhoto)}`,
    `ช่างที่ต้องการ: ${safeValue(data.preferredStaff)}`,
    `ชื่อลูกค้า: ${safeValue(data.name)}`,
    `เบอร์โทร: ${safeValue(data.phone)}`,
    `วันที่สะดวก: ${safeValue(data.preferredDate)}`,
    `เวลาที่สะดวก: ${safeValue(data.preferredTime)}`,
    `รายละเอียดเพิ่มเติม: ${safeValue(data.additionalDetails)}`,
    `จำนวนรูปที่แนบ: ${images.length}`,
    `ลิงก์รูป:\n${imageLines}`,
    `LINE userId: ${safeValue(source.userId)}`,
    `source type: ${safeValue(source.type)}`,
  ].join('\n');
}

function buildRescheduleSummary(event, data) {
  const source = event.source || {};
  return [
    '📌 มีคำขอเปลี่ยนวันนัดจากลูกค้า',
    'ประเภทคำขอ: เปลี่ยนวันนัด',
    `ชื่อหรือเบอร์โทรที่ใช้จอง: ${safeValue(data.nameOrPhone)}`,
    `วันที่ใหม่: ${safeValue(data.newDate)}`,
    `เวลาที่สะดวก: ${safeValue(data.newTime)}`,
    `LINE userId: ${safeValue(source.userId)}`,
    `source type: ${safeValue(source.type)}`,
  ].join('\n');
}

function buildContactAdminSummary(event, originalText) {
  const source = event.source || {};
  return [
    '📌 มีลูกค้าต้องการติดต่อแอดมิน',
    `ข้อความจากลูกค้า: ${safeValue(originalText)}`,
    `LINE userId: ${safeValue(source.userId)}`,
    `source type: ${safeValue(source.type)}`,
  ].join('\n');
}

function buildOldCaseSummary(event, originalText) {
  const source = event.source || {};
  return [
    '📌 มีลูกค้าต้องการคุยกับพนักงาน / เช็กคิวเดิม',
    `ข้อความจากลูกค้า: ${safeValue(originalText)}`,
    `LINE userId: ${safeValue(source.userId)}`,
    `source type: ${safeValue(source.type)}`,
  ].join('\n');
}

async function pushToAdminGroup(text) {
  if (!ADMIN_GROUP_ID) {
    console.warn('ADMIN_GROUP_ID is missing. Skip push to admin group.');
    return;
  }

  try {
    await client.pushMessage(ADMIN_GROUP_ID, [{ type: 'text', text }]);
  } catch (error) {
    console.error('pushToAdminGroup error:', JSON.stringify(error?.originalError?.response?.data || error?.body || error, null, 2));
  }
}

async function pushMessagesToAdminGroup(messages) {
  if (!ADMIN_GROUP_ID) {
    console.warn('ADMIN_GROUP_ID is missing. Skip push messages to admin group.');
    return;
  }

  try {
    console.log('Push to admin group:', JSON.stringify(messages, null, 2));
    await client.pushMessage(ADMIN_GROUP_ID, messages);
  } catch (error) {
    console.error('pushMessagesToAdminGroup error:', JSON.stringify(error?.originalError?.response?.data || error?.body || error, null, 2));
    throw error;
  }
}

async function pushImagesToAdminGroup(images = []) {
  if (!images.length) return;

  const lines = ['📷 ลิงก์รูปที่ลูกค้าส่ง'];

  images.forEach((img, index) => {
    if (img?.url) {
      lines.push(`รูปที่ ${index + 1}: ${img.url}`);
    }
  });

  await pushToAdminGroup(lines.join('\n'));
}

async function replyText(replyToken, text) {
  return replyMessages(replyToken, [{ type: 'text', text }]);
}

async function replyMessages(replyToken, messages) {
  try {
    await client.replyMessage(replyToken, messages);
  } catch (error) {
    console.error('replyMessages error:', JSON.stringify(error?.originalError?.response?.data || error?.body || error, null, 2));
  }
}

function quickReplyText(label) {
  return {
    type: 'action',
    action: {
      type: 'message',
      label,
      text: label,
    },
  };
}

function normalizeText(text) {
  return text.trim().toLowerCase();
}

function isStartTrigger(normalized, rawText) {
  return START_TRIGGER_KEYWORDS.includes(normalized) || START_TRIGGER_KEYWORDS.includes(rawText);
}

function createDefaultSession() {
  return {
    mode: 'idle',
    step: 'service',
    data: {},
    closedAt: null,
    lastSeenAt: Date.now(),
  };
}

function markConversationClosed(userId) {
  sessions.set(userId, {
    mode: 'closed',
    step: 'done',
    data: {},
    closedAt: Date.now(),
    lastSeenAt: Date.now(),
  });
}

function safeValue(value) {
  if (value === undefined || value === null || value === '') {
    return '-';
  }
  return String(value);
}

async function saveIncomingImage(messageId) {
  const stream = await client.getMessageContent(messageId);

  const buffer = await streamToBuffer(stream);

  const uploaded = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'beauty-salon-line',
        resource_type: 'image',
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    uploadStream.end(buffer);
  });

  console.log('Uploaded image to Cloudinary:', uploaded.secure_url);

  return {
    filename: uploaded.public_id,
    filePath: '-',
    url: uploaded.secure_url,
    contentType: 'image/jpeg',
  };
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
