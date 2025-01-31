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

    // Hide the submission loader before showing success alert
    document.getElementById('submitLoader').style.display = 'none';

    alert('Vocabulary successfully stored in Firestore!');
  } catch (err) {
    console.error('Error storing vocabulary:', err);
    alert('Error storing vocabulary: ' + err.message);
  } finally {
    // Hide the submission loader in case of error
    document.getElementById('submitLoader').style.display = 'none';
  }
});
