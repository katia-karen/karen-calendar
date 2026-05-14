import fetch from 'node-fetch';
import FormData from 'form-data';
import { Readable } from 'stream';
import { google } from 'googleapis';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const GOOGLE_TOKEN = process.env.GOOGLE_CALENDAR_TOKEN;

async function transcribeAudio(audioBuffer) {
  const form = new FormData();
  form.append('file', Readable.from(audioBuffer), 'audio.ogg');
  form.append('model', 'whisper-1');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });

  const { text } = await res.json();
  return text;
}

async function addCalendarEvent(title, dateStr, timeStr) {
  // Parse date (muy básico, mejora esto)
  const date = new Date();
  if (dateStr.includes('mañana')) {
    date.setDate(date.getDate() + 1);
  }
  
  // Parse time
  const timeParts = timeStr.match(/(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)?/i);
  let hour = timeParts ? parseInt(timeParts[1]) : 10;
  if (timeParts && timeParts[2] && (timeParts[2].toLowerCase().includes('p'))) {
    hour += 12;
  }

  const dateString = date.toISOString().split('T')[0];
  const startTime = `${dateString}T${String(hour).padStart(2, '0')}:00:00`;

  // Call Google Calendar API via curl (simplificado)
  const curlCmd = `curl -s -X POST https://www.googleapis.com/calendar/v3/calendars/primary/events \\
    -H "Authorization: Bearer ${GOOGLE_TOKEN}" \\
    -H "Content-Type: application/json" \\
    -d '{
      "summary": "${title}",
      "start": {"dateTime": "${startTime}", "timeZone": "America/Hermosillo"},
      "end": {"dateTime": "${startTime.replace(/T\\d\\d:/, 'T' + String(hour + 1).padStart(2, '0') + ':')}", "timeZone": "America/Hermosillo"}
    }'`;

  // For Vercel, use fetch instead
  const eventRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GOOGLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: title,
      start: { dateTime: startTime, timeZone: 'America/Hermosillo' },
      end: { dateTime: startTime.replace(/T\d\d:/, `T${String(hour + 1).padStart(2, '0')}:`), timeZone: 'America/Hermosillo' },
    }),
  });

  return eventRes.ok;
}

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(404).json({ ok: false });
  }

  try {
    const { message } = req.body;

    if (!message?.voice) {
      return res.status(200).json({ ok: true });
    }

    // Download audio
    const fileId = message.voice.file_id;
    const getFileUrl = `https://api.telegram.org/bot${TOKEN}/getFile?file_id=${fileId}`;
    const fileRes = await fetch(getFileUrl);
    const fileData = await fileRes.json();
    const filePath = fileData.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;

    const audioRes = await fetch(downloadUrl);
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

    // Transcribe
    const text = await transcribeAudio(audioBuffer);
    const lowerText = text.toLowerCase();

    // Execute based on keywords
    if (lowerText.includes('agéndame') || lowerText.includes('agendame')) {
      // Extract title and date/time
      const titleMatch = text.match(/(?:agéndame|agendame)\s+(.+?)(?:\s+(?:mañana|el|la|tomorrow|hoy))/i);
      const dateMatch = text.match(/(?:mañana|el\s+\w+|tomorrow|hoy)/i);
      const timeMatch = text.match(/(?:\s+a\s+las?|at)\s+(.+?)(?:\s+[ap]\.?m\.?|$)/i);
      
      if (titleMatch && dateMatch) {
        const title = titleMatch[1].trim();
        const dateStr = dateMatch[0];
        const timeStr = timeMatch ? timeMatch[1] : '10:00';
        
        const ok = await addCalendarEvent(title, dateStr, timeStr);
        await sendTelegram(ok ? '✅' : '❌');
      } else {
        await sendTelegram('✅');
      }
      return res.status(200).json({ ok: true });
    } else if (lowerText.includes('recuérdame') || lowerText.includes('recuerdame')) {
      // Same logic for recordatorios
      const titleMatch = text.match(/(?:recuérdame|recuerdame)\s+(.+?)(?:\s+(?:mañana|el|la|tomorrow|hoy))/i);
      const dateMatch = text.match(/(?:mañana|el\s+\w+|tomorrow|hoy)/i);
      const timeMatch = text.match(/(?:\s+a\s+las?|at)\s+(.+?)(?:\s+[ap]\.?m\.?|$)/i);
      
      if (titleMatch && dateMatch) {
        const title = `📌 ${titleMatch[1].trim()}`;
        const dateStr = dateMatch[0];
        const timeStr = timeMatch ? timeMatch[1] : '09:00';
        
        const ok = await addCalendarEvent(title, dateStr, timeStr);
        await sendTelegram(ok ? '✅' : '❌');
      } else {
        await sendTelegram('✅');
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Voice handler error:', e);
    await sendTelegram(`❌`);
    return res.status(500).json({ ok: false });
  }
}
