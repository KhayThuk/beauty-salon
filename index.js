const express = require('express');
const line = require('@line/bot-sdk');
const { v2: cloudinary } = require('cloudinary');

const app = express();
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/favicon.png', (req, res) => res.status(204).end());
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

const sessions = new Map();

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
  'พิกัดร้าน',
  'พิกัด',
  'แผนที่',
  'จองคิวเพิ่มเติม',
  'คุยกับพนักงาน/เช็กคิวเดิม',
];

const RESTART_KEYWORDS = ['เริ่มใหม่', 'เริ่มต้นใหม่', 'เริ่มใหม่อีกครั้ง', 'start', 'restart', 'เมนู', 'menu'];
const RESCHEDULE_KEYWORDS = ['เปลี่ยนวันนัด', 'เลื่อนนัด'];
const CONTACT_ADMIN_KEYWORDS = ['ติดต่อแอดมิน', 'คุยกับแอดมิน', 'แอดมิน'];
const LOCATION_KEYWORDS = ['พิกัดร้าน', 'พิกัด', 'แผนที่', 'โลเคชั่น', 'location', 'map'];
const OLD_CASE_KEYWORDS = ['คุยกับพนักงาน/เช็กคิวเดิม', 'คุยกับพนักงาน', 'เช็กคิวเดิม', 'คิวเดิม'];
const EXTRA_BOOKING_KEYWORDS = ['จองคิวเพิ่มเติม', 'จองเพิ่ม', 'จองใหม่'];
const POST_PRICE_BOOKING_KEYWORDS = ['จองคิว', 'จองคิวบริการนี้', 'จองบริการนี้', 'เอารายการนี้', 'ต้องการจอง'];

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
  'พิกัดร้าน',
  'พิกัด',
  'แผนที่',
  'คุยกับพนักงาน',
  'คุยกับพนักงาน/เช็กคิวเดิม',
  'เช็กคิวเดิม',
  'คิวเดิม'
];

const CLOSED_WINDOW_MS = 24 * 60 * 60 * 1000;

const SERVICE_REFERENCE_LINKS = {
  'ตัดผมชาย': 'https://drive.google.com/drive/folders/17p6P1qZpXtgePMhO38Svu15hFg5oU__g?usp=drive_link',
  'ทำเล็บ': 'https://drive.google.com/drive/folders/1XKvlT5TvD1fml47Opt233TzZNLsq0nsE?usp=drive_link',
  'ต่อเล็บ': 'https://drive.google.com/drive/folders/1XKvlT5TvD1fml47Opt233TzZNLsq0nsE?usp=drive_link',
  'ดัดผม': 'https://drive.google.com/drive/folders/1_JROcKwjIa8ZDnQYMt7xZ9h6dtKuX1PB?usp=sharing',
  'สักลาย': 'https://drive.google.com/drive/folders/1HQ_iedlG7WU7uIlnnxEcflaejGDe38tw?usp=drive_link',
};

const PRESELECT_REFERENCE_SERVICES = ['ตัดผมชาย', 'ทำเล็บ', 'ต่อเล็บ', 'ดัดผม'];

app.get('/', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'beauty-salon-line-bot',
    message: 'LINE webhook is running',
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

      if (LOCATION_KEYWORDS.includes(normalized) || incomingText === 'พิกัดร้าน') {
        await replyMessages(replyToken, [buildLocationMessage()]);
        return 'closed_location';
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

    if (LOCATION_KEYWORDS.includes(normalized) || incomingText === 'พิกัดร้าน') {
      await replyMessages(replyToken, [buildLocationMessage()]);
      return 'reopen_location';
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

  if (session.mode === 'postPriceAction') {
    const rememberedService = session.data?.priceService;

    if (POST_PRICE_BOOKING_KEYWORDS.includes(incomingText) || POST_PRICE_BOOKING_KEYWORDS.includes(normalized)) {
      if (!rememberedService) {
        sessions.set(userId, {
          mode: 'booking',
          step: 'service',
          data: {},
          closedAt: null,
          lastSeenAt: Date.now(),
        });
        await replyText(replyToken, 'ต้องการจองคิวสำหรับบริการไหนคะ กรุณาระบุบริการที่ต้องการได้เลยค่ะ');
        return 'post_price_booking_without_memory';
      }

      startBookingFromKnownService(userId, rememberedService);

      if (rememberedService === 'สักลาย') {
        await replyMessages(replyToken, buildTattooIntroMessages());
        return 'post_price_booking_tattoo';
      }

      await replyMessages(replyToken, buildServiceIntroMessages(rememberedService));
      return 'post_price_booking_known_service';
    }

    if (CONTACT_ADMIN_KEYWORDS.includes(normalized)) {
      await pushToAdminGroup(buildContactAdminSummary(event, incomingText));
      markConversationClosed(userId);
      await replyText(replyToken, 'รับเรื่องเรียบร้อยแล้วค่ะ ทางร้านจะติดต่อกลับเร็วที่สุดนะคะ');
      return 'post_price_contact_admin';
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
      return 'post_price_to_price_again';
    }

    if (LOCATION_KEYWORDS.includes(normalized) || incomingText === 'พิกัดร้าน') {
      await replyMessages(replyToken, [buildLocationMessage()]);
      return 'post_price_location';
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

    if (RESTART_KEYWORDS.includes(normalized)) {
      sessions.set(userId, {
        mode: 'booking',
        step: 'service',
        data: {},
        closedAt: null,
        lastSeenAt: Date.now(),
      });
      await replyMessages(replyToken, [buildWelcomeMessage(), buildServiceQuestion()]);
      return 'post_price_restart';
    }

    await replyMessages(replyToken, [
      {
        type: 'text',
        text: rememberedService
          ? `หากต้องการจองคิวบริการ ${rememberedService} สามารถกด “จองคิวบริการนี้” ได้เลยค่ะ`
          : 'หากต้องการดำเนินการต่อ สามารถเลือกเมนูด้านล่างได้เลยค่ะ',
        quickReply: {
          items: [
            quickReplyText('จองคิวบริการนี้'),
            quickReplyText('สอบถามราคา'),
            quickReplyText('พิกัดร้าน'),
            quickReplyText('ติดต่อแอดมิน'),
            quickReplyText('เมนู'),
          ],
        },
      },
    ]);
    return 'post_price_repeat_options';
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

  if (LOCATION_KEYWORDS.includes(normalized) || incomingText === 'พิกัดร้าน') {
    await replyMessages(replyToken, [buildLocationMessage()]);
    return 'send_location';
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
    await replyText(
      replyToken,
      'ได้รับรูปเรียบร้อยแล้วค่ะ\nหากต้องการเริ่มจองคิว กรุณาพิมพ์ “เมนู” หรือเลือกบริการที่ต้องการได้เลยนะคะ'
    );
    return 'image_outside_booking';
  }
}

  const currentService = session.data?.service;

  if (!['tattooNeedPhoto', 'tattooChooseDesign', 'style', 'samplePhoto'].includes(session.step)) {
    await replyText(replyToken, 'ได้รับรูปเรียบร้อยแล้วค่ะ\nหากต้องการแนบรูปประกอบเพิ่มเติม รบกวนแจ้งรายละเอียดต่อได้เลยนะคะ');
    return 'image_unexpected_booking';
  }

  try {
    const saved = await saveIncomingImage(event.message.id);

    if (!session.data.images) session.data.images = [];
    session.data.images.push(saved);

    if (session.step === 'tattooNeedPhoto') {
      session.step = 'tattooChooseDesign';

      await replyText(
        replyToken,
        'ได้รับรูปเรียบร้อยแล้วค่ะ\nสามารถส่งรูปแบบลายที่ต้องการมาเพิ่มได้ หรือพิมพ์รายละเอียดลาย / ตำแหน่ง / ขนาดที่ต้องการได้เลยนะคะ'
      );
      return 'tattoo_first_image_saved';
    }

    if (session.step === 'tattooChooseDesign') {
      await replyText(replyToken, 'ได้รับรูปเพิ่มเติมเรียบร้อยแล้วค่ะ\nรบกวนพิมพ์ลายที่ต้องการ ตำแหน่งที่จะสัก และขนาดโดยประมาณได้เลยนะคะ');
      return 'tattoo_extra_image_saved';
    }

    if (session.step === 'style') {
  session.data.samplePhoto = 'มีรูปตัวอย่างแล้ว';
  session.step = 'preferredStaff';

  await replyText(
    replyToken,
    'ได้รับรูปตัวอย่างเรียบร้อยแล้วค่ะ\nช่างเเพรวเป็นผู้ให้บริการนะคะ หากตกลงพิมพ์ "โอเค" ได้เลยค่ะ'
  );
  return 'reference_style_image_saved';
}

 if (session.step === 'samplePhoto') {
  session.data.samplePhoto = 'มีรูปตัวอย่างแล้ว';
  session.step = 'preferredStaff';

  await replyText(
    replyToken,
    'ได้รับรูปตัวอย่างเรียบร้อยแล้วค่ะ\nช่างเเพรวเป็นผู้ให้บริการนะคะ หากตกลงพิมพ์ "โอเค" ได้เลยค่ะ'
  );

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

      if (text === 'พิกัดร้าน') {
        session.mode = 'idle';
        session.step = 'service';
        await replyMessages(replyToken, [buildLocationMessage()]);
        return 'service_location';
      }

      if (text === 'จองคิว' || text === 'จองคิวเพิ่มเติม') {
        session.step = 'style';
        await replyText(replyToken, 'ต้องการจองสำหรับบริการไหนคะ กรุณาระบุบริการที่ต้องการได้เลยค่ะ');
        return 'service_booking_general';
      }

      if (text === 'สักลาย') {
        session.step = 'tattooNeedPhoto';
        session.data.images = [];
        await replyMessages(replyToken, buildTattooIntroMessages());
        return 'ask_tattoo_intro';
      }

      session.step = 'style';
      await replyMessages(replyToken, buildServiceIntroMessages(text));
      return 'ask_service_intro';
    }

    case 'tattooNeedPhoto':
      await replyText(replyToken, 'รบกวนส่งรูปก่อนนะคะ เพื่อให้ทางร้านดูรายละเอียดเบื้องต้นก่อนค่ะ');
      return 'tattoo_waiting_image';

    case 'tattooChooseDesign':
      session.data.style = text;
      session.step = 'name';
      await replyText(replyToken, 'ขอทราบชื่อสำหรับการจองหน่อยค่ะ');
      return 'tattoo_style_to_name';

    case 'style': {
      session.data.style = text;

      if (PRESELECT_REFERENCE_SERVICES.includes(session.data.service)) {
        session.data.samplePhoto = session.data.samplePhoto || 'ลูกค้าเลือกแบบ/แจ้งรายละเอียดแล้ว';
        session.step = 'preferredStaff';
        await replyText(replyToken, 'ช่างเเพรวเป็นผู้ให้บริการนะคะ ตกลง พิมพ์ โอเค ครับ/ค่ะ ได้เลยค่ะ');
        return 'ask_staff_skip_sample_photo_for_reference_service';
      }

      session.step = 'samplePhoto';
      await replyText(replyToken, 'มีรูปตัวอย่างไหมคะ ถ้ามีสามารถส่งรูปมาได้เลย หรือถ้าไม่มีให้พิมพ์ว่า “ไม่มีค่ะ” ได้เลยค่ะ');
      return 'ask_sample_photo';
    }

    case 'samplePhoto':
      session.data.samplePhoto = text;
      session.step = 'preferredStaff';
      await replyText(replyToken, 'ช่างเเพรวเป็นผู้ให้บริการนะคะ ตกลง พิมพ์ โอเค ครับ/ค่ะ ได้เลยค่ะ');
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
      await replyText(replyToken, 'มีรายละเอียดเพิ่มเติมไหมคะ หากมีสามารถพิมพ์แจ้งตอนนี้ได้เลยนะคะ');
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
          text: `หากต้องการจองคิวบริการ ${selectedService} สามารถกด “จองคิวบริการนี้” ได้เลยค่ะ`,
          quickReply: {
            items: [
              quickReplyText('จองคิวบริการนี้'),
              quickReplyText('สอบถามราคา'),
              quickReplyText('พิกัดร้าน'),
              quickReplyText('ติดต่อแอดมิน'),
              quickReplyText('เมนู'),
            ],
          },
        },
      ]);

      sessions.set(userId, {
        mode: 'postPriceAction',
        step: 'afterPrice',
        data: {
          priceService: selectedService,
        },
        closedAt: null,
        lastSeenAt: Date.now(),
      });

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
    text: 'สวัสดีค่ะ ยินดีต้อนรับสู่ร้าน เรือนไทย Beauty Salon ✨\nทางร้านยินดีให้ข้อมูลเรื่องบริการ ราคา การจองคิว และการเปลี่ยนวันนัดค่ะ',
    quickReply: {
      items: [
        quickReplyText('จองคิว'),
        quickReplyText('สอบถามราคา'),
        quickReplyText('เปลี่ยนวันนัด'),
        quickReplyText('ติดต่อแอดมิน'),
        quickReplyText('พิกัดร้าน'),
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
        quickReplyText('พิกัดร้าน'),
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
    type: 'flex',
    altText: 'เมนูสอบถามราคา',
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: 'สอบถามราคาบริการ',
            weight: 'bold',
            size: 'xl',
            color: '#4E4326',
          },
          {
            type: 'text',
            text: 'กรุณาเลือกหมวดที่ต้องการสอบถามราคาได้เลยค่ะ',
            wrap: true,
            color: '#6B5E3B',
            size: 'sm',
          },
          ...buildPriceMenuButtons(),
        ],
      },
      styles: {
        body: {
          backgroundColor: '#F5E8BE',
        },
      },
    },
  };
}

function buildPriceMenuButtons() {
  const labels = [
    'ราคาตัดผมชาย',
    'ราคาทำเล็บ',
    'ราคาต่อเล็บ',
    'ราคาทำสีผม',
    'ราคาดัดผม',
    'ราคาสระ/ไดร์',
    'ราคาทรีตเมนต์',
    'ราคาสักลาย',
  ];

  return labels.map((label) => ({
    type: 'button',
    style: 'secondary',
    height: 'sm',
    color: '#D8C99A',
    action: {
      type: 'message',
      label,
      text: label,
    },
  }));
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

function startBookingFromKnownService(userId, service) {
  const nextSession = {
    mode: 'booking',
    step: service === 'สักลาย' ? 'tattooNeedPhoto' : 'style',
    data: {
      service,
      images: service === 'สักลาย' ? [] : undefined,
    },
    closedAt: null,
    lastSeenAt: Date.now(),
  };

  sessions.set(userId, nextSession);
  return nextSession;
}

function getSamplePriceData(service) {
  const priceMap = {
    'ตัดผมชาย': {
      price: 'เริ่มต้น 80 บาท',
      details: 'ทรงแฟชั่น ทูบล็อค รากไทร ไลเเฟด',
    },
    'ทำเล็บ': {
      price: 'เริ่มต้น 159 บาท',
      details: 'ขึ้นอยู่กับรายการที่่ต้องการ เช่น ทาสีเจล สอบถามพนังงานเพิ่มเติมได้เลยค่ะ',
    },
    'ต่อเล็บ': {
      price: 'เริ่มต้น 199 บาท',
      details: 'ขึ้นอยู่กับการเลือกต้องการแบบไหน เช่น ต่อเล็บชิดโคน pvc',
    },
    'ทำสีผม': {
      price: 'เริ่มต้น 99 บาท',
      details: 'ขึ้นอยู่กับความยาวผม สีเดิม และสีที่ต้องการเช็คหน้างานอีกครั้งค่ะ',
    },
    'ดัดผม': {
      price: 'เริ่มต้น 800 บาท',
      details: 'ขึ้นอยู่กับความยาวผมและรูปแบบลอน',
    },
    'สระ/ไดร์': {
      price: 'เริ่มต้น 150 บาท',
      details: 'ไดร์ตรง / ไดร์ลอน ราคาต่างกันเล็กน้อย ขึ้นอยู่กับความยาวผม ชาย/หญิง เช็คหน้างานอีกครั้งค่ะ',
    },
    'ทรีตเมนต์': {
      price: 'เริ่มต้น 199 บาท',
      details: 'ขึ้นอยู่กับสูตรที่เลือกและสภาพเส้นผม',
    },
    'สักลาย': {
      price: 'เริ่มต้น 800 บาท',
      details: 'ขึ้นอยู่กับขนาด ตำแหน่ง และความละเอียดของลาย',
    },
  };

  return priceMap[service] || {
    price: 'กรุณาสอบถามเพิ่มเติม',
    details: 'รายละเอียดราคาอาจเปลี่ยนแปลงตามบริการ และหน้างาน กรุณาสอบถามพนักงานเพิ่มเติมได้เลยค่ะ',
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

function buildLocationMessage() {
  return {
    type: 'flex',
    altText: 'พิกัดร้าน Beauty Salon',
    contents: {
      type: 'bubble',
      size: 'mega',
      hero: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        backgroundColor: '#D8C99A',
        contents: [
          {
            type: 'text',
            text: '📍 พิกัดร้าน เรือนไทย Beauty Salon',
            weight: 'bold',
            size: 'xl',
            color: '#4E4326',
            wrap: true,
          },
          {
            type: 'text',
            text: 'เปิดให้บริการทุกวัน',
            margin: 'md',
            size: 'sm',
            color: '#6B5E3B',
          },
          {
            type: 'text',
            text: '09.00 น. - 19.00 น.',
            margin: 'sm',
            weight: 'bold',
            size: 'lg',
            color: '#4E4326',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            contents: [
              {
                type: 'text',
                text: '🕘',
                flex: 0,
                size: 'md',
              },
              {
                type: 'text',
                text: 'เปิด 9.00 น. - 19.00 น.',
                wrap: true,
                color: '#4E4326',
                size: 'md',
              },
            ],
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            contents: [
              {
                type: 'text',
                text: 'ℹ️',
                flex: 0,
                size: 'md',
              },
              {
                type: 'text',
                text: '(หากวันหยุดแอดมินจะแจ้งให้ทราบ)',
                wrap: true,
                color: '#6B5E3B',
                size: 'sm',
              },
            ],
          },
          {
            type: 'separator',
            margin: 'md',
          },
          {
            type: 'text',
            text: 'กดปุ่มด้านล่างเพื่อเปิดแผนที่ได้เลยค่ะ',
            wrap: true,
            color: '#4E4326',
            size: 'sm',
            margin: 'md',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#8B6B3F',
            height: 'sm',
            action: {
              type: 'uri',
              label: 'เปิดแผนที่ร้าน',
              uri: 'https://maps.app.goo.gl/MkTzWooXkZwXPfwf8',
            },
          },
        ],
      },
      styles: {
        body: {
          backgroundColor: '#F8F1D7',
        },
        footer: {
          backgroundColor: '#F8F1D7',
        },
      },
    },
  };
}

function hasServiceReferenceCard(service) {
  return Boolean(SERVICE_REFERENCE_LINKS[service]);
}

function buildServiceIntroMessages(service) {
  const messages = [];

  if (hasServiceReferenceCard(service)) {
    messages.push(buildServiceReferenceFlex(service));
  }

  messages.push({
    type: 'text',
    text: buildDetailQuestion(service),
  });

  return messages;
}

function buildTattooIntroMessages() {
  return [
    buildServiceReferenceFlex('สักลาย'),
    {
      type: 'text',
      text: 'เลือกลายที่ชอบจากลิงก์ได้เลยค่ะ หรือถ้ามีลายมาเองสามารถส่งรูปมาให้ร้านเช็กได้เช่นกัน\nจากนั้นรบกวนส่งรูปบริเวณที่จะสักหรือรูปอ้างอิงเบื้องต้นมา 1 รูปได้เลยนะคะ',
    },
  ];
}

function buildServiceReferenceFlex(service) {
  const configs = {
    'ตัดผมชาย': {
      title: 'ตัดผมชาย',
      subtitle: 'เช็กแบบทรงผมก่อนเริ่มจองคิว',
      detailLines: [
        '• กดปุ่มด้านล่างเพื่อดูรูปทรงผมตัวอย่าง',
        '• เลือกรูปที่ชอบแล้วส่งกลับมาให้ร้านได้เลย',
        '• หากรู้ชื่อทรงผม สามารถพิมพ์ชื่อทรงส่งมาพร้อมกันได้',
        '• แจ้งความยาวผมปัจจุบันหรือสไตล์ที่อยากได้เพิ่มได้ค่ะ',
      ],
      buttonLabel: 'เช็กรูปทรงผม',
    },
    'ทำเล็บ': {
      title: 'ทำเล็บ',
      subtitle: 'เช็กแบบเล็บก่อนเริ่มจองคิว',
      detailLines: [
        '• กดปุ่มด้านล่างเพื่อดูรูปแบบเล็บตัวอย่าง',
        '• เลือกลาย สี หรือโทนที่ชอบแล้วส่งมาให้ร้านได้ค่ะ',
        '• หากมีลายที่ต้องการอยู่แล้ว สามารถส่งรูปของตัวเองมาได้',
        '• แจ้งได้เลยว่าต้องการทาสีเจล สปามือ หรือดูแลเล็บแบบไหน',
      ],
      buttonLabel: 'เช็กรูปทำเล็บ',
    },
    'ต่อเล็บ': {
      title: 'ต่อเล็บ',
      subtitle: 'เช็กแบบต่อเล็บก่อนเริ่มจองคิว',
      detailLines: [
        '• กดปุ่มด้านล่างเพื่อดูตัวอย่างทรงและลายเล็บ',
        '• เลือกแบบที่ชอบแล้วส่งรูปมาให้ร้านประเมินได้เลย',
        '• หากมีแบบมาเอง สามารถส่งรูปของตัวเองให้ร้านเช็กได้ค่ะ',
        '• แจ้งความยาว ทรงเล็บ และลายที่ต้องการมาพร้อมกันได้เลย',
      ],
      buttonLabel: 'เช็กรูปต่อเล็บ',
    },
    'ดัดผม': {
      title: 'ดัดผม',
      subtitle: 'เช็กแบบลอนก่อนเริ่มจองคิว',
      detailLines: [
        '• กดปุ่มด้านล่างเพื่อดูตัวอย่างลอนดัด',
        '• ลูกค้าชายหรือหญิงสามารถเลือกแบบลอนที่ชอบแล้วส่งมาได้เลย',
        '• แจ้งความยาวผมปัจจุบันและสภาพผมคร่าว ๆ เช่น ผมตรง ผมทำสี หรือผมเสีย',
        '• หากมีแบบจากที่อื่น สามารถส่งรูปมาให้ร้านช่วยประเมินได้ค่ะ',
      ],
      buttonLabel: 'เช็กรูปดัดผม',
    },
    'สักลาย': {
      title: 'สักลาย',
      subtitle: 'เช็กลายก่อนเริ่มจองคิว',
      detailLines: [
        '• กดปุ่มด้านล่างเพื่อดูตัวอย่างลายสัก',
        '• เลือกลายที่ชอบแล้วส่งรูปกลับมาให้ร้านเช็กได้เลย',
        '• หากมีลายมาเอง สามารถส่งรูปของตัวเองให้ร้านประเมินได้ค่ะ',
        '• หลังจากนั้นรบกวนส่งรูปบริเวณที่จะสักหรือรูปอ้างอิงเบื้องต้นเพิ่มเติม',
      ],
      buttonLabel: 'เช็กรูปลายสัก',
    },
  };

  const config = configs[service];
  if (!config) {
    return {
      type: 'text',
      text: buildDetailQuestion(service),
    };
  }

  return {
    type: 'flex',
    altText: `${config.title} - เช็กรูปก่อนจองคิว`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        backgroundColor: '#D8C99A',
        contents: [
          {
            type: 'text',
            text: config.title,
            weight: 'bold',
            size: 'xl',
            color: '#4E4326',
            wrap: true,
          },
          {
            type: 'text',
            text: config.subtitle,
            margin: 'md',
            size: 'sm',
            color: '#6B5E3B',
            wrap: true,
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: config.detailLines.map((line) => ({
          type: 'text',
          text: line,
          size: 'sm',
          color: '#4E4326',
          wrap: true,
        })),
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#8B6B3F',
            action: {
              type: 'uri',
              label: config.buttonLabel,
              uri: SERVICE_REFERENCE_LINKS[service],
            },
          },
        ],
      },
      styles: {
        body: {
          backgroundColor: '#F8F1D7',
        },
        footer: {
          backgroundColor: '#F8F1D7',
        },
      },
    },
  };
}

function buildDetailQuestion(service) {
  const map = {
    'ตัดผมชาย': 'เลือกรูปที่ชอบแล้วส่งมาให้ร้านได้เลยค่ะ หรือพิมพ์ชื่อทรงผมที่ต้องการ พร้อมแจ้งรายละเอียดเพิ่มเติมได้เลยนะคะ',
    'ทำเล็บ': 'เลือกลายหรือโทนสีที่ชอบแล้วส่งมาให้ร้านได้เลยค่ะ หรือถ้ามีแบบมาเองก็ส่งรูปมาได้เช่นกันนะคะ',
    'ต่อเล็บ': 'เลือกทรงหรือแบบเล็บที่ต้องการแล้วส่งมาได้เลยค่ะ พร้อมแจ้งความยาว ทรง และลายที่ต้องการนะคะ',
    'ทำสีผม': 'ต้องการทำสีผมโทนไหนคะ และผมปัจจุบันยาวประมาณไหน หรือเคยผ่านการทำสีมาก่อนไหมคะ',
    'ดัดผม': 'เลือกรูปลอนที่ชอบแล้วส่งมาได้เลยค่ะ พร้อมแจ้งว่าเป็นผมชายหรือหญิง ความยาวผม และสภาพผมคร่าว ๆ นะคะ',
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
    `สถานะแบบอ้างอิง: ${safeValue(data.samplePhoto)}`,
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
