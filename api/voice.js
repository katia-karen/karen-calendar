import fetch from 'node-fetch';
import FormData from 'form-data';
import { Readable } from 'stream';

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
  const date = new Date();
  
  // Parse date
  if (dateStr && (dateStr.includes('mañana') || dateStr.includes('tomorrow'))) {
    date.setDate(date.getDate() + 1);
  } else if (dateStr && dateStr.includes('pasado')) {
    date.setDate(date.getDate() + 2);
  }
  
  // Parse time - handle "11 A.M.", "11am", "11 pm", etc.
  let hour = 10;
  if (timeStr) {
    const cleanTime = timeStr.replace(/\s+/g, '').toLowerCase();
    const hourMatch = cleanTime.match(/(\d{1,2})/);
    if (hourMatch) {
      hour = parseInt(hourMatch[1]);
      // Add 12 for PM times
      if (cleanTime.includes('p') && hour < 12) {
        hour += 12;
      }
    }
  }

  const dateString = date.toISOString().split('T')[0];
  const startTime = `${dateString}T${String(hour).padStart(2, '0')}:00:00`;
  const endTime = `${dateString}T${String(hour + 1).padStart(2, '0')}:00:00`;

  try {
    await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GOOGLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: title,
        start: { dateTime: startTime, timeZone: 'America/Hermosillo' },
        end: { dateTime: endTime, timeZone: 'America/Hermosillo' },
      }),
    });
    return true;
  } catch (e) {
    console.error('Calendar API error:', e);
    return false;
  }
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

    // Respond immediately (no await) to avoid long responses
    res.status(200).json({ ok: true });

    // Process in background (fire and forget)
    (async () => {
      try {
        // Download audio
        const fileId = message.voice.file_id;
        const getFileUrl = `https://api.telegram.org/bot${TOKEN}/getFile?file_id=${fileId}`;
        const fileRes = await fetch(getFileUrl);
        const fileData = await fileRes.json();
        const filePath = fileData.result.file_path;
        const downloadUrl = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;

        const audioRes = await fetch(downloadUrl);
        const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

        // Transcribe (this is the ONLY cost: ~$0.003)
        const text = await transcribeAudio(audioBuffer);
        const lowerText = text.toLowerCase();

        // Execute silently (no response sent)
        if (lowerText.includes('agéndame') || lowerText.includes('agendame')) {
          const titleMatch = text.match(/(?:agéndame|agendame)\s+(.+?)(?:\s+(?:mañana|el\s+\w+|tomorrow|hoy|pasado))/i);
          const dateMatch = text.match(/(?:mañana|el\s+\w+|tomorrow|hoy|pasado\s+mañana)/i);
          const timeMatch = text.match(/(?:\s+a\s+las?|at)\s+(.+?)(?:\s+[ap]\.?m\.?|$)/i);
          
          if (titleMatch && dateMatch) {
            const title = titleMatch[1].trim();
            const dateStr = dateMatch[0];
            const timeStr = timeMatch ? timeMatch[1] : '10:00';
            
            await addCalendarEvent(title, dateStr, timeStr);
            // Silent success
          }
          
        } else if (lowerText.includes('recuérdame') || lowerText.includes('recuerdame')) {
          const titleMatch = text.match(/(?:recuérdame|recuerdame)\s+(.+?)(?:\s+(?:mañana|el\s+\w+|tomorrow|hoy|pasado))/i);
          const dateMatch = text.match(/(?:mañana|el\s+\w+|tomorrow|hoy|pasado\s+mañana)/i);
          const timeMatch = text.match(/(?:\s+a\s+las?|at)\s+(.+?)(?:\s+[ap]\.?m\.?|$)/i);
          
          if (titleMatch && dateMatch) {
            const title = `📌 ${titleMatch[1].trim()}`;
            const dateStr = dateMatch[0];
            const timeStr = timeMatch ? timeMatch[1] : '09:00';
            
            await addCalendarEvent(title, dateStr, timeStr);
            // Silent success
          }
        }
      } catch (e) {
        console.error('Background error:', e);
        // Fail silently
      }
    })();
  } catch (e) {
    console.error('Voice handler error:', e);
    return res.status(500).json({ ok: false });
  }
}
