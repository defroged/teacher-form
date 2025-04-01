const firebaseConfig = {
  apiKey: "AIzaSyCTdo6AfCDj3yVCnndBCIOrLRm7oOaDFW8",
  authDomain: "bs-class-database.firebaseapp.com",
  projectId: "bs-class-database",
  storageBucket: "bs-class-database.firebasestorage.app",
  messagingSenderId: "577863988524",
  appId: "1:577863988524:web:dc28f58ed0350419d62889"
};

const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

let globalVocabulary = [];

function renderVocabularyList() {
  const vocabularyListDiv = document.getElementById('vocabularyList');
  vocabularyListDiv.innerHTML = '';

  if (globalVocabulary.length === 0) {
    vocabularyListDiv.textContent = 'No vocabulary found.';
    document.getElementById('submitVocabulary').style.display = 'none';
    return;
  }

  globalVocabulary.forEach((word) => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = word;
    checkbox.checked = true;

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(word));
    vocabularyListDiv.appendChild(label);
    vocabularyListDiv.appendChild(document.createElement('br'));
  });

  document.getElementById('submitVocabulary').style.display = 'inline-block';
}

document.getElementById('uploadForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const fileInput = document.getElementById('imageFiles');
  if (!fileInput.files.length) {
    alert('Please select at least one image!');
    return;
  }

  // Show the upload loader
  document.getElementById('uploadLoader').style.display = 'block';

  const uploadToCloudinary = async (file) => {
    const cloudinaryUrl = "https://api.cloudinary.com/v1_1/dzo0vucxp/image/upload";
    const uploadPreset = "Flashcards_Data"; // Make sure this is an unsigned preset

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", uploadPreset);

    const response = await fetch(cloudinaryUrl, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error("Cloudinary upload failed");
    }

    const data = await response.json();
    return data.secure_url; // Get the hosted image URL
  };

  const imageUrls = [];
  for (let i = 0; i < fileInput.files.length; i++) {
    const file = fileInput.files[i];
    try {
      const imageUrl = await uploadToCloudinary(file);
      imageUrls.push(imageUrl);
    } catch (error) {
      console.error("Image upload failed:", error);
      alert("Failed to upload images. Please try again.");
      return;
    }
  }

  try {
    const response = await fetch('/api/extractDataFromImages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrls })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to fetch data from server');
    }

    const { processedData } = await response.json();
    const vocabularyArr = processedData.vocabulary || [];
    globalVocabulary = [...new Set([...globalVocabulary, ...vocabularyArr])];
    renderVocabularyList();
  } catch (error) {
    console.error(error);
    alert(error.message);
  } finally {
    // Hide the upload loader regardless of success or error
    document.getElementById('uploadLoader').style.display = 'none';
  }
});

document.getElementById('addWordBtn').addEventListener('click', () => {
  const additionalWordInput = document.getElementById('additionalWord');
  const newWord = additionalWordInput.value.trim();

  if (!newWord) {
    alert('Please enter a word or phrase before adding!');
    return;
  }
  globalVocabulary = [...new Set([...globalVocabulary, newWord])];
  renderVocabularyList();
  additionalWordInput.value = '';
});

document.getElementById('submitVocabulary').addEventListener('click', async () => {
  const checkboxes = document.querySelectorAll('#vocabularyList input[type="checkbox"]');
  const selectedVocabulary = [];
  checkboxes.forEach((checkbox) => {
    if (checkbox.checked) {
      selectedVocabulary.push(checkbox.value);
    }
  });

  const selectedClass = document.getElementById('classDropdown').value;

  // Show the submission loader
  document.getElementById('submitLoader').style.display = 'block';

  try {
    // 1. Call our new API endpoint to process the list of selected words via OpenAI
    const response = await fetch('/api/createDataFromList', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ words: selectedVocabulary })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create data from list');
    }

    // 2. The new endpoint returns an array of objects under "processedList"
    const { processedList } = await response.json();

    // 3. Save the processed vocabulary data (objects) in Firestore
    const classDocRef = db.collection('Academic-classes').doc(selectedClass);
    const submissionsRef = classDocRef.collection('Submissions');
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const docId = `${year}-${month}-${day}-${hours}-${minutes}`;

    await submissionsRef.doc(docId).set({
      Vocabulary: processedList,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Hide the submission loader
    document.getElementById('submitLoader').style.display = 'none';

    // Construct the dynamic URL
    const dynamicURL = `https://flashcards-opal-seven.vercel.app/${selectedClass}/${docId}`;

    // Hide all the existing form elements
document.getElementById('uploadForm').style.display = 'none';
document.getElementById('vocabularyList').style.display = 'none';
document.getElementById('submitVocabulary').style.display = 'none';
document.getElementById('additionalWordContainer').style.display = 'none';


    // Show the generated URL and build the calendar UI
const urlContainer = document.createElement('div');
urlContainer.innerHTML = `<p>${dynamicURL}</p>`;

// Create a container for the one-week calendar checkboxes
const calendarContainer = document.createElement('div');

// We will determine the current date/time in Japan
// Create an array for day names in Japanese
const dayNamesJa = ['日', '月', '火', '水', '木', '金', '土'];

// Helper function to get a Date object in Japan for a given offset (0 for today, 1 for tomorrow, etc.)
function getJSTDate(offsetDays) {
  const now = new Date();
  // Convert from local time to Japan time by adding/subtracting the difference in minutes
  // Japan is UTC+9, but for simplicity, let's just create a new date and then shift it
  // so that it shows local JST date. This is a simplistic approach but works for most cases.
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  // 9 hours in milliseconds = 9 * 60 * 60000 = 32400000
  const jstTime = utc + (9 * 60 * 60000);
  const jstDate = new Date(jstTime);
  
  // Now add offsetDays in days:
  jstDate.setDate(jstDate.getDate() + offsetDays);
  return jstDate;
}

// Create checkboxes for 7 days starting from the current day
// But we only allow selection of the future 6 days, so the user can't select index 0 if you want them to skip "today"
for (let i = 0; i < 7; i++) {
  const dateObj = getJSTDate(i);
  const day = dateObj.getDate();
  const month = dateObj.getMonth() + 1;
  const dayOfWeek = dateObj.getDay(); // 0=Sun,1=Mon,...6=Sat

  const label = document.createElement('label');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.value = i; // store the offset
  checkbox.disabled = (i === 0); // disable the current day if we don't allow it
  // If you want to allow the current day, just remove this line:
  // checkbox.disabled = (i === 0);

  // By default, if i is 1 (tomorrow), 3, or 5 => checked
  if (i === 1 || i === 3 || i === 5) {
    checkbox.checked = true;
  }
  
  label.appendChild(checkbox);
  label.appendChild(document.createTextNode(
    `${month}/${day} (${dayNamesJa[dayOfWeek]})`
  ));
  label.style.display = 'block';
  
  calendarContainer.appendChild(label);
}

// We might add a note about "You can select up to 6 days"
const note = document.createElement('p');
note.textContent = '※ 最大 6日まで選択可能（当日を除く）';
calendarContainer.appendChild(note);

urlContainer.appendChild(calendarContainer);

// Create the booking button
const bookingBtn = document.createElement('button');
bookingBtn.id = 'bookingButton';
bookingBtn.textContent = '予約をする';

// Add click handler for booking
bookingBtn.addEventListener('click', async () => {
  // Gather selected days from the checkboxes
  const checkboxes = calendarContainer.querySelectorAll('input[type="checkbox"]');
  const selectedOffsets = [];
  checkboxes.forEach((cb) => {
    if (cb.checked && !cb.disabled) {
      selectedOffsets.push(parseInt(cb.value));
    }
  });

  if (selectedOffsets.length === 0) {
    alert('予約日を少なくとも1日選択してください。');
    return;
  }
  if (selectedOffsets.length > 6) {
    alert('予約日は最大6日までです。');
    return;
  }

  // This is where we do the Discord scheduling logic.
  // You mentioned “send a message to each channel that has the webhook” – 
  // presumably we have a function that retrieves the relevant webhook(s) for the selected class name:
  const selectedClass = document.getElementById('classDropdown').value;
  const webhooksForClass = await getWebhooksForClass(selectedClass);
  // ^ You need to implement getWebhooksForClass. For example, it could fetch from Firestore or a config list.

  // For each selected offset day, we want to schedule sending the dynamicURL at 17:00 JST
  // *NOTE*: Actually sending at a future time requires a backend or a CRON job. 
  // For demonstration, we’ll just do an immediate console log or a fetch to your server to register the schedule.

  try {
    // Example: making an API call to your server so it can queue the Discord messages
    const schedulePayload = {
      dynamicURL,
      selectedOffsets,
      timezone: 'Asia/Tokyo',
      sendHour: 17,
      webhooks: webhooksForClass,
      className: selectedClass
    };

    // Adjust this path /api/scheduleDiscord or similar to your real endpoint
    const scheduleResponse = await fetch('/api/scheduleDiscord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(schedulePayload),
    });

    if (!scheduleResponse.ok) {
      throw new Error('Failed to schedule Discord messages');
    }

    alert('予約が完了しました！');
  } catch (err) {
    console.error('Error scheduling Discord messages:', err);
    alert('エラーが発生しました。詳細はコンソールを確認してください。');
  }
});

// Append the booking button
urlContainer.appendChild(bookingBtn);

// Finally, append the entire container to the .container
document.querySelector('.container').appendChild(urlContainer);

/**
 * Example placeholder function to fetch webhooks for the chosen class.
 * You must implement this as needed. Maybe you have them stored in Firestore
 * or in a config object in your code.
 */
/**
 * Example placeholder function to fetch webhooks for the chosen class.
 * You must implement this as needed. Maybe you have them stored in Firestore
 * or in a config object in your code.
 */
async function getWebhooksForClass(className) {
  try {
    const docRef = await db.collection('DiscordWebhooks').doc(className).get();
    if (!docRef.exists) {
      return [];
    }
    const data = docRef.data();
    return data.webhookURLs || [];
  } catch (err) {
    console.error('Error fetching webhooks:', err);
    return [];
  }
}

  } catch (err) {
    console.error('Error storing vocabulary:', err);
    alert('Error storing vocabulary: ' + err.message);
  } finally {
    // Hide the submission loader in case of error
    document.getElementById('submitLoader').style.display = 'none';
  }
});

/* 
  ---------------------------------------------
  NEW FUNCTION TO FETCH CLASS NAMES FROM FIRESTORE 
  AND POPULATE THE DROPDOWN
  ---------------------------------------------
*/

async function populateClassDropdown() {
  const classDropdown = document.getElementById('classDropdown');
  classDropdown.innerHTML = ''; // Clear any existing options

  try {
    const snapshot = await db.collection('Academic-classes').get();
    snapshot.forEach((doc) => {
      // doc.id will be the class name if you're using the doc ID as the class name
      const option = document.createElement('option');
      option.value = doc.id;
      option.textContent = doc.id;
      classDropdown.appendChild(option);
    });
  } catch (error) {
    console.error("Error fetching classes from Firestore:", error);
    alert("Error fetching classes. Check console for details.");
  }
}

// Call the function to populate the dropdown once everything is set up
populateClassDropdown();
