// -------------------- Firebase Config --------------------
const firebaseConfig = {
  apiKey: "AIzaSyCTdo6AfCDj3yVCnndBCIOrLRm7oOaDFW8",
  authDomain: "bs-class-database.firebaseapp.com",
  projectId: "bs-class-database",
  storageBucket: "bs-class-database.firebasestorage.app",
  messagingSenderId: "577863988524",
  appId: "1:577863988524:web:dc28f58ed0350419d62889"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();
// ---------------------------------------------------------

document.getElementById('uploadForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const fileInput = document.getElementById('imageFiles');
  if (!fileInput.files.length) {
    alert('Please select at least one image!');
    return;
  }

  const imageUrls = [];
  for (let i = 0; i < fileInput.files.length; i++) {
    const file = fileInput.files[i];
    const reader = new FileReader();

    const readPromise = new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result);
      reader.onerror = (err) => reject(err);
    });
    reader.readAsDataURL(file);
    const result = await readPromise;
    imageUrls.push(result);
  }

  try {
    // Call your backend to extract text-based data from images
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

    const vocabularyListDiv = document.getElementById('vocabularyList');
    vocabularyListDiv.innerHTML = ''; // Clear previous items

    if (vocabularyArr.length > 0) {
      vocabularyArr.forEach((word) => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = word;
        checkbox.checked = true; // default checked

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(word));
        vocabularyListDiv.appendChild(label);
        vocabularyListDiv.appendChild(document.createElement('br'));
      });
      document.getElementById('submitVocabulary').style.display = 'inline-block';
    } else {
      vocabularyListDiv.textContent = 'No vocabulary found.';
      document.getElementById('submitVocabulary').style.display = 'none';
    }
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
});

// -------------------- Add More Words Logic --------------------
document.getElementById('addWordBtn').addEventListener('click', () => {
  const additionalWordInput = document.getElementById('additionalWord');
  const newWord = additionalWordInput.value.trim();

  if (!newWord) {
    alert('Please enter a word or phrase before adding!');
    return;
  }

  const vocabularyListDiv = document.getElementById('vocabularyList');
  const label = document.createElement('label');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.value = newWord;
  checkbox.checked = true; // default checked

  label.appendChild(checkbox);
  label.appendChild(document.createTextNode(newWord));
  vocabularyListDiv.appendChild(label);
  vocabularyListDiv.appendChild(document.createElement('br'));

  // Clear the input field
  additionalWordInput.value = '';
});

// -------------------- Submit Vocabulary to Firestore --------------------
document.getElementById('submitVocabulary').addEventListener('click', async () => {
  const checkboxes = document.querySelectorAll('#vocabularyList input[type="checkbox"]');
  const selectedVocabulary = [];
  checkboxes.forEach((checkbox) => {
    if (checkbox.checked) {
      selectedVocabulary.push(checkbox.value);
    }
  });

  // Get the selected class from the dropdown
  const selectedClass = document.getElementById('classDropdown').value;

  try {
    // Reference to the chosen class doc in "Academic-classes" collection
    const classDocRef = db.collection('Academic-classes').doc(selectedClass);

    // Subcollection "Submissions"
    const submissionsRef = classDocRef.collection('Submissions');

    // Create a new document inside the "Submissions" subcollection
    // Format the date/time as "YYYY-MM-DD-HH:MM"
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const docId = `${year}-${month}-${day}-${hours}:${minutes}`;

    await submissionsRef.doc(docId).set({
      Vocabulary: selectedVocabulary,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    alert('Vocabulary successfully stored in Firestore!');
  } catch (err) {
    console.error('Error storing vocabulary:', err);
    alert('Error storing vocabulary: ' + err.message);
  }
});
