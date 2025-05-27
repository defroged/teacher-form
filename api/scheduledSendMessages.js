// /api/scheduledSendMessages.js

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';

// Initialize your Firebase app with the same config as your front-end
const firebaseConfig = {
  apiKey: "AIzaSyCTdo6AfCDj3yVCnndBCIOrLRm7oOaDFW8", // Make sure this is the correct key for your project
  authDomain: "bs-class-database.firebaseapp.com",
  projectId: "bs-class-database",
  storageBucket: "bs-class-database.firebasestorage.app",
  messagingSenderId: "577863988524",
  appId: "1:577863988524:web:dc28f58ed0350419d62889"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Convert a Firestore Timestamp or stored date-time to a standard JS Date
function toDate(millisOrTimestamp) {
  // If stored as a Firestore Timestamp, you'll do: 
  //    return new Date(millisOrTimestamp.seconds * 1000);
  // If stored as a number of milliseconds:
  return new Date(millisOrTimestamp);
}

export default async function handler(req, res) {
  try {
    // 1. Fetch all tasks from "ScheduledMessages" (whatever collection you create).
    //    That collection might hold multiple documents, each describing the message
    //    that needs to be sent at a certain time.
    const scheduledMessagesRef = collection(db, 'ScheduledMessages');
    const snapshot = await getDocs(scheduledMessagesRef);

    const now = new Date();

    const tasksToSend = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      // Example fields in data might be:
      // {
      //   dynamicURL: "https://flashcards...",
      //   webhooks: [ ... ],
      //   scheduledTime: 1680417600000, // e.g. April 2 2025 at 17:00 JST in UTC ms
      //   status: "not_sent"
      // }
      if (data.status === 'not_sent') {
        const scheduledDate = toDate(data.scheduledTime); 
        if (scheduledDate <= now) {
          tasksToSend.push({ id: docSnap.id, ...data });
        }
      }
    });

    // 2. For each task that is due, send the Discord message
    for (const task of tasksToSend) {
      // task.webhooks is expected to be an array of URL strings
      for (const hookUrl of task.webhooks) { // Iterate directly over URL strings
        if (!hookUrl || typeof hookUrl !== 'string') { // Basic validation for the URL string
          console.warn('Invalid or missing webhook URL:', hookUrl, 'for task ID:', task.id);
          continue;
        }

        const payload = {
          content: `Hello! Here is your flashcards link: ${task.dynamicURL}`
        };

        try {
          const response = await fetch(hookUrl, { // Use hookUrl directly
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!response.ok) {
            console.error(`Discord webhook send error for ${hookUrl}: ${response.status} ${response.statusText}`, await response.text());
          }
        } catch (err) {
          console.error(`Exception sending to Discord webhook ${hookUrl}:`, err);
        }
      }

      // 3. Mark the task as 'sent' so we don't send it again
      await updateDoc(doc(db, 'ScheduledMessages', task.id), { status: 'sent' });
    }

    return res.status(200).json({ message: 'Cron job executed successfully', tasksSent: tasksToSend.length });
  } catch (error) {
    console.error('Error in scheduledSendMessages:', error);
    return res.status(500).json({ error: error.toString() });
  }
}
