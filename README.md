# Beauty Salon LINE Messaging API Bot

ระบบ LINE Messaging API สำหรับร้าน Beauty Salon แบบ **ไม่ใช้ฐานข้อมูล** และ **ไม่เก็บข้อมูลลงคอม**

เหมาะกับกรณีที่ต้องการให้บอต:
- คุยกับลูกค้าอัตโนมัติ
- เก็บข้อมูลเฉพาะระหว่างคุยใน memory/runtime
- เมื่อลูกค้าให้ข้อมูลครบแล้ว ส่งสรุปไปที่ LINE Group แอดมิน
- ให้แอดมินเช็กเองในกลุ่มและติดต่อกลับลูกค้าเอง

> หมายเหตุ: state ถูกเก็บแบบ in-memory แยกตาม `userId` ดังนั้นลูกค้าหลายคนคุยพร้อมกันได้
> แต่ถ้า server restart ข้อมูล state จะหาย ซึ่งตรงตาม requirement

---

## ความสามารถหลัก

- ใช้ Node.js + Express
- มี `POST /webhook` สำหรับ LINE webhook
- มี `GET /` สำหรับ health check
- ใช้ environment variables:
  - `LINE_CHANNEL_ACCESS_TOKEN`
  - `LINE_CHANNEL_SECRET`
  - `ADMIN_GROUP_ID`
- รองรับ deploy บน Render
- ไม่ใช้ MySQL หรือฐานข้อมูลใด ๆ
- แยก state ตาม `userId`
- มี quick reply ภาษาไทย
- แยกฟังก์ชันอ่านง่าย แก้ข้อความง่าย

---

## โครงสร้างไฟล์

```bash
beauty-salon-line-bot/
├─ index.js
├─ package.json
├─ .env.example
├─ .gitignore
└─ README.md
```

---

## วิธีทำงานของระบบ

### Flow หลัก
1. ลูกค้าทักมา
2. ระบบส่งข้อความต้อนรับ
3. ถามว่าต้องการใช้บริการอะไร
4. ถามรายละเอียดต่อ เช่น แบบที่ต้องการ สี ความยาวผม ลายเล็บ ช่างที่ต้องการ รูปตัวอย่าง
5. ถามข้อมูลการจอง เช่น ชื่อ เบอร์โทร วันที่สะดวก เวลาที่สะดวก รายละเอียดเพิ่มเติม
6. เมื่อข้อมูลครบ ระบบสรุปแล้วส่งเข้า LINE Group แอดมิน
7. ระบบตอบกลับลูกค้าว่าได้รับข้อมูลเรียบร้อยแล้ว

### Flow เปลี่ยนวันนัด
ถ้าลูกค้าพิมพ์:
- `เปลี่ยนวันนัด`
- `เลื่อนนัด`

ระบบจะถามต่อ:
- ชื่อหรือเบอร์โทรที่ใช้จอง
- วันที่ใหม่
- เวลาที่สะดวก

แล้วส่งสรุปไปยังกลุ่มแอดมิน

### Flow ติดต่อแอดมิน
ถ้าลูกค้าพิมพ์:
- `ติดต่อแอดมิน`

ระบบจะส่งข้อความสรุปเข้า group แอดมิน และตอบลูกค้าว่าทางร้านจะติดต่อกลับเร็วที่สุด

---

## การเก็บ state

ระบบนี้ใช้ `Map()` ใน Node.js เพื่อเก็บ session แบบง่าย ๆ

ตัวอย่างแนวคิด:

```js
const sessions = new Map();
```

โดยเก็บแยกตาม `userId` เช่น:
- A คุยอยู่เรื่องทำสีผม
- B คุยอยู่เรื่องต่อเล็บ
- C คุยอยู่เรื่องเปลี่ยนวันนัด

แต่ละคนจะไม่ชนกัน เพราะแยก state ต่อ user

---

## การตั้งค่า LINE Developers

### 1) สร้าง Messaging API Channel
เข้า LINE Developers แล้วสร้าง Provider / Messaging API Channel

### 2) เอาค่าเหล่านี้มาใช้
คุณต้องมี:
- Channel Access Token
- Channel Secret

### 3) เชิญบอตเข้ากลุ่มแอดมิน
สร้าง LINE Group สำหรับแอดมิน 1 ห้อง แล้วเชิญบอตเข้ากลุ่มนั้น

### 4) หา `ADMIN_GROUP_ID`
วิธีง่ายสุดคือให้บอตอยู่ในกลุ่ม แล้วดู event ที่เข้ามาจาก group
ใน event จะมีค่า `source.groupId`
ค่านี้ให้นำไปใส่ใน `ADMIN_GROUP_ID`

---

## วิธีติดตั้งบนเครื่อง

### 1) Clone โปรเจกต์
```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/beauty-salon-line-bot.git
cd beauty-salon-line-bot
```

### 2) ติดตั้ง package
```bash
npm install
```

### 3) สร้างไฟล์ `.env`
คัดลอกจาก `.env.example`

```bash
cp .env.example .env
```

แล้วใส่ค่าจริง:

```env
LINE_CHANNEL_ACCESS_TOKEN=YOUR_CHANNEL_ACCESS_TOKEN
LINE_CHANNEL_SECRET=YOUR_CHANNEL_SECRET
ADMIN_GROUP_ID=YOUR_ADMIN_GROUP_ID
PORT=3000
```

### 4) รันในเครื่อง
```bash
npm start
```

ถ้ารันสำเร็จ จะมี health check ที่:

```bash
http://localhost:3000/
```

---

## Deploy ขึ้น GitHub

### 1) สร้าง repository ใหม่บน GitHub
เช่นชื่อ:

```bash
beauty-salon-line-bot
```

### 2) push โค้ดขึ้น GitHub
```bash
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/beauty-salon-line-bot.git
git push -u origin main
```

---

## Deploy บน Render

### 1) ไปที่ Render
ล็อกอินแล้วกดสร้าง **New Web Service**

### 2) เลือก GitHub repository
เลือก repo `beauty-salon-line-bot`

### 3) ตั้งค่าเบื้องต้น
- **Environment**: Node
- **Build Command**:
  ```bash
  npm install
  ```
- **Start Command**:
  ```bash
  npm start
  ```

### 4) ตั้งค่า Environment Variables ใน Render
เพิ่ม 3 ตัวนี้:
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `ADMIN_GROUP_ID`

และจะใส่ `PORT` หรือไม่ก็ได้ เพราะ Render ใส่ให้อัตโนมัติ

### 5) Deploy
เมื่อ deploy เสร็จ จะได้ URL เช่น:

```bash
https://your-service-name.onrender.com
```

---

## ตั้งค่า Webhook URL ใน LINE Developers

เอา URL จาก Render ไปใส่เป็น webhook:

```bash
https://your-service-name.onrender.com/webhook
```

จากนั้น:
- เปิด **Use webhook**
- กด **Verify**

ถ้า verify ผ่าน แปลว่าใช้งานได้

---

## Start command ที่ใช้บน Render

```bash
npm start
```

ใน `package.json` มีแล้ว:

```json
"scripts": {
  "start": "node index.js"
}
```

---

## ฟังก์ชันสำคัญในโค้ด

ในไฟล์ `index.js` มีการแยกฟังก์ชันไว้แล้ว เช่น:
- `handleEvent`
- `handleTextMessage`
- `buildWelcomeMessage`
- `buildServiceQuestion`
- `buildSummaryForAdmin`
- `pushToAdminGroup`

ทำให้แก้ข้อความได้ง่าย และดูแลง่าย

---

## ตัวอย่างข้อความที่ลูกค้าจะเห็น

### ข้อความต้อนรับ
> สวัสดีค่ะ ยินดีต้อนรับสู่ร้าน Beauty Salon ✨
> ทางร้านยินดีให้ข้อมูลเรื่องบริการ ราคา การจองคิว และการเปลี่ยนวันนัดค่ะ

### ข้อความยืนยันหลังเก็บข้อมูลครบ
> ทางร้านได้รับข้อมูลเรียบร้อยแล้ว เดี๋ยวแอดมินหรือช่างจะติดต่อกลับเพื่อยืนยันวันและเวลาที่แน่ชัดอีกครั้งนะคะ

---

## ข้อจำกัดของระบบนี้

- ไม่มีฐานข้อมูล
- ถ้า Render restart หรือมีการ redeploy ข้อมูล state จะหาย
- ไม่เหมาะกับการเก็บประวัติลูกค้าระยะยาว
- ถ้าต้องการเก็บนัดหมายถาวรในอนาคต ค่อยต่อฐานข้อมูลเพิ่มภายหลังได้

---

## ข้อแนะนำเพิ่มเติม

ถ้าต้องการให้ใช้งานจริงสะดวกขึ้นในอนาคต อาจเพิ่มได้ เช่น:
- รองรับรูปภาพตัวอย่างจากลูกค้า
- รองรับ Flex Message
- รองรับเลือกวัน/เวลาแบบปุ่ม
- แยก flow ระหว่าง “สอบถามราคา” กับ “จองคิว” ให้ละเอียดขึ้น
- เพิ่มคำสั่ง `เริ่มใหม่`

ตอนนี้ในโค้ดมีคำว่า `เริ่มใหม่` ใช้ reset บทสนทนาได้แล้ว

---

## License

MIT
