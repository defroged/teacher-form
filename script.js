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
        checkbox.checked = true; // <-- Default to checked

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

document.getElementById('submitVocabulary').addEventListener('click', () => {
  const checkboxes = document.querySelectorAll('#vocabularyList input[type="checkbox"]');
  const selectedVocabulary = [];
  checkboxes.forEach((checkbox) => {
    if (checkbox.checked) {
      selectedVocabulary.push(checkbox.value);
    }
  });
  // For now we just log them, but in the future we can store them in the DB
  console.log('Selected Vocabulary:', selectedVocabulary);
  alert('Submitted! (not actually stored yet)');
});
