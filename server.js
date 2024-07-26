/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { handleStatBoy, handleStatGen } from "./statsHandlers.js";
import { handleGeminiResponse } from "./aiHandlers.js";
import { signatureRequired } from "./security.js";
import { getStaffNameByNumber, getUserPhoneNumberInSession, isPegawaiPhoneNumberInSession } from "./func.js";
import { handlePSTResponse, pegawaiBroadcast, sendMessageToPegawai } from "./pegawaiHandlers.js"
import { unsupportedType, homeMessage, backOnline, wrongCommand, optionOne, backToMenu, optionTwo, optionThree, optionfour, app, validOptions, WEBHOOK_VERIFY_TOKEN, GRAPH_API_TOKEN, PORT, sessionStatus, PEGAWAI_NUMBERS, connectedWithPegawai, SESSION_LIMIT } from "./const.js";
import axios from 'axios';
import express from 'express';
import dotenv from 'dotenv';


{// Middleware
  // Middleware to parse JSON payloads
  app.use(express.json());
  // Middleware to parse URL-encoded data
  app.use(express.urlencoded({ extended: true }));
}

// Inisialisasi array availablePegawai dengan nomor pegawai
let availablePegawai = PEGAWAI_NUMBERS.map(pegawai => pegawai.number);

// Inisialisasi Online Time
let serverOnlineTime = 0;

// Simpan status pengguna yang sudah menerima balasan
// Ini untuk mengakali jika whatsapp mengirim webhook dari pesan2 lama yg dikirim user sebelum server aktif
// sebenarnya ada di dokumentasi tetapi untuk kemudahan dilakukan cara ini meskipun masih terdapat flaws karena webhook kadang memiliki delay yg lama
let repliedUsers = {};

/**
 * Mengirim pesan WhatsApp menggunakan Graph API Facebook.
 * Pesan dapat dikirim sebagai balasan untuk pesan tertentu dengan menyediakan ID pesan konteks.
 *
 * @async
 * @function
 * @name sendWhatsAppMessage
 *
 * @param {string} phone_number_id - ID nomor telepon bisnis yang digunakan untuk mengirim pesan.
 * @param {string} recipient - Nomor telepon penerima pesan.
 * @param {string} text - Teks pesan yang akan dikirim.
 * @param {string} [context_message_id=null] - (Opsional) ID pesan konteks untuk mengirim balasan (reply).
 *
 * @example
 * sendWhatsAppMessage('123456789', 'recipient123', 'Hello, world!');
 * sendWhatsAppMessage('123456789', 'recipient123', 'This is a reply', 'message_id_456');
 *
 * @returns {Promise<void>}
 */
async function sendWhatsAppMessage(phone_number_id, recipient, text, context_message_id = null) {
  const url = `https://graph.facebook.com/v20.0/${phone_number_id}/messages`;
  const headers = {
    Authorization: `Bearer ${GRAPH_API_TOKEN}`,
    "Content-Type": "application/json",
  };
  const data = {
    messaging_product: "whatsapp",
    to: recipient,
    text: { body: text },
  };
  if (context_message_id) {
    data.context = { message_id: context_message_id };
  }

  try {
    const response = await axios.post(url, data, { headers });
    console.log("Message sent successfully:");
  } catch (error) {
    console.error("Error sending message:");
    console.error(`Recipient: ${recipient}`);
    console.error(`Message: ${text}`);
    console.error("Error details:", error.response.data);
  }
}


async function markMessageAsSeen(business_phone_number_id, message_id) {
  const url = `https://graph.facebook.com/v20.0/${business_phone_number_id}/messages`;
  const headers = {
    Authorization: `Bearer ${GRAPH_API_TOKEN}`,
    "Content-Type": "application/json",
  };
  const data = {
    messaging_product: "whatsapp",
    status: "read",
    message_id: message_id,
  };

  try {
    await axios.post(url, data, { headers });
    console.log("Message marked as seen:");
  } catch (error) {
    console.error("Error marking message as seen:", error.response.data);
  }
}

// TODO typing indicator
async function showTypingIndicator() {
}


/**
 * Menangani kedaluwarsa sesi untuk penerima tertentu.
 * Menghapus status sesi dari objek sessionStatus dan mengirim pesan pemberitahuan sesi kedaluwarsa melalui WhatsApp.
 *
 * @async
 * @function
 * @name handleSessionExpiration
 * 
 * @param {string} business_phone_number_id - ID nomor telepon bisnis yang digunakan untuk mengirim pesan.
 * @param {string} recipient - Penerima yang sesi-nya telah berakhir.
 *
 * @example
 * handleSessionExpiration('123456789', 'recipient123');
 *
 * @returns {Promise<void>}
 */
async function handleSessionExpiration(business_phone_number_id, recipient) {
  delete sessionStatus[recipient];
  const sessionExpiredMessage = "Sesi Anda telah berakhir. Silahkan kirim pesan lagi untuk memulai sesi baru.";
  console.log("SESSION EXPIRED :", business_phone_number_id, " ", recipient);
  await sendWhatsAppMessage(business_phone_number_id, recipient, sessionExpiredMessage);
}



/**
 * Memeriksa kedaluwarsa sesi untuk setiap penerima dalam objek sessionStatus.
 * Jika sesi telah tidak aktif selama lebih dari 3 menit (180000 ms), sesi akan dianggap kedaluwarsa dan
 * fungsi handleSessionExpiration akan dipanggil untuk menangani kedaluwarsa sesi tersebut.
 *
 * @function
 * @name checkSessionExpiration
 *
 * @example
 * checkSessionExpiration();
 *
 * @returns {void}
 */
function checkSessionExpiration() {
  const currentTime = Date.now();
  for (const recipient in sessionStatus) {
    if ((currentTime - sessionStatus[recipient].lastActive) > SESSION_LIMIT) {
      handleSessionExpiration(sessionStatus[recipient].businessPhoneNumberId, recipient);
    }
  }
}


/**
 * Memanggil fungsi checkSessionExpiration setiap 60 detik (60000 ms) untuk memeriksa dan menangani
 * kedaluwarsa sesi secara berkala.
 *
 * @example
 * setInterval(checkSessionExpiration, 60000);
 *
 * @returns {void}
 */
setInterval(checkSessionExpiration, 60000);

/**
 * Endpoint webhook untuk menangani pesan masuk dari WhatsApp.
 * Mengelola sesi pengguna, merespon pesan berdasarkan input pengguna, dan mengirim pesan balik ke pengguna.
 *
 * @async
 * @function
 * @name /webhook
 * 
 * @param {Object} req - Objek permintaan dari Express, berisi pesan yang diterima dari webhook.
 * @param {Object} res - Objek respons dari Express.
 *
 * @example
 * app.post("/webhook", async (req, res) => { ... });
 *
 * @returns {void}
 */
app.post("/webhook", signatureRequired, async (req, res) => {
  // Mengambil entri pertama dari body permintaan
  const entry = req.body.entry?.[0];
  if (!entry) {
    res.sendStatus(400); // Mengirim status 400 jika entry tidak ada
    return;
  }

  // Mengambil perubahan pertama dari entri
  const changes = entry.changes?.[0];
  if (!changes) {
    res.sendStatus(400); // Mengirim status 400 jika perubahan tidak ada
    return;
  }

  // Mengambil nilai dari webhook
  const value = changes.value;
  const businessPhoneNumberId = value.metadata?.phone_number_id; // Mengambil ID nomor telepon bisnis
  const messages = value.messages?.[0]; // Mengambil pesan pertama dari nilai
  const statuses = value.statuses?.[0]; // Mengambil status pertama dari nilai
  const messageTimestamp = messages?.timestamp; // Mengambil timestamp pesan
  const statusTimestamp = statuses?.timestamp; // Mengambil timestamp status
  const userPhoneNumber = messages?.from || statuses?.recipient_id; // Mengambil nomor telepon pengguna dari pesan atau status

  // menangani respon pertama tanggapan pegawai
  if (messages && messages?.interactive) {
    const { interactive } = messages;
    if (interactive.button_reply) {
      const { id: buttonId } = interactive.button_reply;
      const uniqueId = buttonId.split('_')[1]; //nomor penanya
      sessionStatus[uniqueId] = { lastActive: Date.now(), optionSession: 4, businessPhoneNumberId: businessPhoneNumberId, pegawaiPhoneNumber: userPhoneNumber };
      console.log("-------------------------------------------------------");
      console.log(`Pegawai ${getStaffNameByNumber(userPhoneNumber)} menanggapi pertanyaan dari nomor: ${uniqueId}`);
      console.log("SESSION = ", sessionStatus);
      console.log("-------------------------------------------------------");
      // Logika tambahan untuk menangani respons, misalnya:
      // - Menyimpan respons dalam database
      // - Memperbarui status sesi
      // - Mengirim pesan tindak lanjut ke pengguna atau pegawai

      // Contoh logika tambahan
      availablePegawai = availablePegawai.filter(number => number !== userPhoneNumber);
      await sendWhatsAppMessage(businessPhoneNumberId, uniqueId, `${connectedWithPegawai}${getStaffNameByNumber(userPhoneNumber)}`);
    }
    res.sendStatus(200);
    return
  }


  // Menangani pesan teks yang diterima
  if (messages && messages.timestamp) {
    // console.log("--- Received Text Message ---");
    // console.log(JSON.stringify(req.body, null, 2));
    // console.log("------------------------------");
    await markMessageAsSeen(businessPhoneNumberId, messages.id);
    // await showTypingIndicator());
    // Handle message logic here, e.g., reply to the message
  } else if (statuses && statuses.timestamp) {
    // Menangani pembaruan status yang diterima
    // console.log("--- Received Status Update ---");
    // console.log(JSON.stringify(req.body, null, 2));
    // console.log("------------------------------");

    // Handle status update logic here, if needed
    res.sendStatus(200);
    return
  } else {
    // Menangani payload webhook yang tidak dikenali
    console.log("--- Unknown Webhook Payload ---");
    console.log("Incoming webhook message:", JSON.stringify(req.body, null, 2));
    console.log("------------------------------");
    res.sendStatus(200);
    return
    // Handle unknown webhook logic here, if needed
  }

  // Handle unsupported message types
  if (messages?.type && messages.type !== "text") {
    // Mengirim pesan balasan untuk jenis pesan yang tidak didukung
    await sendWhatsAppMessage(businessPhoneNumberId, userPhoneNumber, unsupportedType);
    sessionStatus[userPhoneNumber] = { lastActive: Date.now(), optionSession: null, businessPhoneNumberId: businessPhoneNumberId, pegawaiPhoneNumber: null };
    res.sendStatus(200);
    return
  }

  // Handle message sent when server offline
  if ((messageTimestamp < serverOnlineTime) && !(userPhoneNumber in repliedUsers)) {
    // Mengirim pesan balasan dari pesan yang dikirim ketika server offline
    await sendWhatsAppMessage(businessPhoneNumberId, userPhoneNumber, backOnline, messages?.id);
    await sendWhatsAppMessage(businessPhoneNumberId, userPhoneNumber, homeMessage);
    sessionStatus[userPhoneNumber] = { lastActive: Date.now(), optionSession: null, businessPhoneNumberId: businessPhoneNumberId, pegawaiPhoneNumber: null };
    // Tandai pengguna sudah menerima balasan
    repliedUsers[userPhoneNumber] = true;
    res.sendStatus(200);
    return
  }

  // Handle First Message
  if ((messageTimestamp > serverOnlineTime) && (!(userPhoneNumber in sessionStatus)) && !isPegawaiPhoneNumberInSession(sessionStatus, userPhoneNumber)) {
    // Mengirim pesan balasan untuk pesan pertama setelah server online
    sessionStatus[userPhoneNumber] = { lastActive: Date.now(), optionSession: null, businessPhoneNumberId: businessPhoneNumberId, pegawaiPhoneNumber: null };
    await sendWhatsAppMessage(businessPhoneNumberId, userPhoneNumber, homeMessage);
    res.sendStatus(200);
    return;
  }

  // Handle Menu Message
  if ((messageTimestamp > serverOnlineTime) && messages && ((userPhoneNumber in sessionStatus) || isPegawaiPhoneNumberInSession(sessionStatus, userPhoneNumber))) {
    let responseText = "";

    if (messages.text) {
      const userMessage = messages.text.body.trim().toLowerCase();
      const isValidOption = validOptions.includes(userMessage);

      // menangani pesan yang dikirim pegawai agar diteruskan ke penanya
      if (isPegawaiPhoneNumberInSession(sessionStatus, userPhoneNumber)) {
        responseText = userMessage
        console.log("PESAN PEGAWAI DITERUSKAN KE PENANYA ", getUserPhoneNumberInSession(sessionStatus, userPhoneNumber));
        await sendWhatsAppMessage(businessPhoneNumberId, getUserPhoneNumberInSession(sessionStatus, userPhoneNumber), responseText);
        res.sendStatus(200);
        return
      }
      const { optionSession } = sessionStatus[userPhoneNumber];
      // Log informasi penting untuk debug atau analisis
      console.log("----------------------------------");
      console.log("optionSession = ", optionSession);
      console.log("isValidOption = ", isValidOption);
      console.log("userMessage = ", userMessage);
      console.log("businessPhoneNumberId = ", businessPhoneNumberId);
      console.log("userPhoneNumber = ", userPhoneNumber);
      console.log("SESSION = ", sessionStatus);
      console.log("----------------------------------");

      if (optionSession) {
        console.log("MASUK 1");
        // Handle jika ada opsi yang sedang dipilih pengguna
        if (userMessage === "0") {
          // Handle jika pengguna memilih untuk kembali ke menu utama
          sessionStatus[userPhoneNumber] = { lastActive: Date.now(), optionSession: null, businessPhoneNumberId: businessPhoneNumberId };
          await sendWhatsAppMessage(businessPhoneNumberId, userPhoneNumber, homeMessage);
          res.sendStatus(200);
          return;
        }
        // Switch case untuk menangani setiap opsi yang dipilih pengguna
        switch (optionSession) {
          case "1":
            responseText = await handleStatBoy(userMessage);
            break;
          case "2":
            responseText = await handleStatGen(userMessage);
            break;
          case "3":
            responseText = await handleGeminiResponse(userMessage);
            break;
          case "4":
            console.log("MASUK");
            responseText = userMessage;
            await sendMessageToPegawai(businessPhoneNumberId, sessionStatus[userPhoneNumber].pegawaiPhoneNumber, responseText, userPhoneNumber);
            res.sendStatus(200);
            return;
        }
      }
      else if (isValidOption) {
        console.log("MASUK 2");
        // Handle jika pesan yang diterima merupakan opsi yang valid
        sessionStatus[userPhoneNumber].optionSession = userMessage;
        switch (userMessage) {
          case "0":
            responseText = homeMessage;
            break;
          case "1":
            responseText = optionOne + backToMenu;
            break;
          case "2":
            responseText = optionTwo + backToMenu;
            break;
          case "3":
            responseText = optionThree + backToMenu;
            break;
          case "4":
            responseText = optionfour + backToMenu;
            await pegawaiBroadcast(businessPhoneNumberId, availablePegawai, userMessage, userPhoneNumber);
            return
        }
      } else {
        console.log("MASUK 3");
        // Handle jika pesan yang diterima tidak sesuai dengan opsi yang valid
        responseText = wrongCommand + homeMessage;
        sessionStatus[userPhoneNumber] = { lastActive: Date.now(), optionSession: null, businessPhoneNumberId: businessPhoneNumberId, pegawaiPhoneNumber: null };
      }
      console.log("MASUK Z");
      // Mengirim pesan balasan kembali ke pengguna
      await sendWhatsAppMessage(businessPhoneNumberId, userPhoneNumber, responseText);
      res.sendStatus(200);
      return;
    }

  }

  // Log the timestamps to the console
  console.log("---------------------------------------------------------------------------------------");
  console.log(`Server Online Time: ${new Date(serverOnlineTime * 1000).toLocaleString()}`);
  console.log(messageTimestamp ? `Message timestamp: ${new Date(messageTimestamp * 1000).toLocaleString()}` : 'Message timestamp not available.');
  console.log(statusTimestamp ? `Status timestamp: ${new Date(statusTimestamp * 1000).toLocaleString()}` : 'Status timestamp not available.');
  console.log("SESSION = ", sessionStatus);
  console.log("available pegawai ", availablePegawai);
  console.log("---------------------------------------------------------------------------------------");
});



/**
 * Endpoint untuk verifikasi webhook dari WhatsApp.
 * Memverifikasi token dan mode yang dikirim oleh WhatsApp untuk memastikan keabsahan webhook.
 *
 * @function
 * @name /webhook
 *
 * @param {Object} req - Objek permintaan dari Express, berisi parameter query untuk verifikasi.
 * @param {Object} res - Objek respons dari Express.
 *
 * @example
 * app.get('/webhook', (req, res) => { ... });
 *
 * @returns {void}
 */
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  console.log(`mode: ${mode}`);
  console.log(`token: ${token}`);
  console.log(`challenge: ${challenge}`);

  if (mode && token) {
    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
      console.log('Webhook verification successful');
      res.status(200).send(challenge);
    } else {
      console.log('Webhook verification failed');
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

app.listen(PORT, () => {
  const date = new Date(); // Current date and time
  const unixTimestampInSeconds = Math.floor(date.getTime() / 1000);
  serverOnlineTime = unixTimestampInSeconds;
  console.log(`Server Online Time: ${serverOnlineTime}`);
  console.log(`Server is listening on port: ${PORT}`);
});