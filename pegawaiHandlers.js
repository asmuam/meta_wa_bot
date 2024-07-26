// pegawaisHandler.js
import dotenv from 'dotenv';
import axios from 'axios';
import { backToMenu, broadcastPegawai } from "./const.js";
import { GRAPH_API_TOKEN } from './const.js';
dotenv.config();

export async function sendMessageToPegawai(businessPhoneNumberId, pegawaiNumber, userMessage, userPhoneNumber) {
  let data;
  if (userMessage == "4") {
    userMessage = broadcastPegawai
    data = {
      messaging_product: "whatsapp",
      to: pegawaiNumber,
      type: 'interactive',
      interactive: {
        type: 'button',
        // header: {
        //   type: 'image',
        //   image: {
        //     link: 'https://boyolalikab.bps.go.id/backend/images/Header-Frontend-Besar-ind.png' // Replace with your image URL
        //   }
        // },
        body: {
          text: userMessage
        },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: `respond_${userPhoneNumber}`,
                title: 'Mulai Sesi!'
              }
            }
          ]
        }
      }
    };
  } else {
    data = {
      messaging_product: "whatsapp",
      to: pegawaiNumber,
      text: { body: userMessage }, // Correct structure for text messages
    };
  }
  
  const url = `https://graph.facebook.com/v20.0/${businessPhoneNumberId}/messages`;
  const headers = {
    Authorization: `Bearer ${GRAPH_API_TOKEN}`,
    "Content-Type": "application/json",
  };


  try {
    const response = await axios.post(url, data, { headers });
    console.log("Message sent successfully:");
  } catch (error) {
    console.error("Error sending message:");
    console.error(`Recipient: ${pegawaiNumber}`);
    console.error(`Message: ${userMessage}`);
    console.error("Error details:", error.response.data);
  }
}


export async function pegawaiBroadcast(businessPhoneNumberId, availablePegawai, userMessage, userPhoneNumber) {
  // kirim broadcast ke semua pegawai
  for (const number of availablePegawai) {
    try {
      // Misalkan menggunakan API untuk mengirim pesan
      await sendMessageToPegawai(businessPhoneNumberId, number, userMessage, userPhoneNumber)
      console.log(`Pesan terkirim ke ${number}`);
    } catch (error) {
      console.error(`Gagal mengirim pesan ke ${number}:`, error);
    }
  }
  return
}

export function handlePSTResponse() {

}
