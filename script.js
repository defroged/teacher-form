const firebaseConfig = {
  apiKey: "AIzaSyCTdo6AfCDj3yVCnndBCIOrLRm7oOaDFW8",
  authDomain: "bs-class-database.firebaseapp.com",
  projectId: "bs-class-database",
  storageBucket: "bs-class-database.firebasestorage.app",
  messagingSenderId: "577863988524",
  appId: "1:577863988524:web:dc28f58ed0350419d62889"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MAX_SCHEDULE_DAYS = 6;
const DEFAULT_SCHEDULE_MINUTES = 17 * 60;
const SCHEDULE_START_MINUTES = 9 * 60;
const SCHEDULE_END_MINUTES = 20 * 60;
const SCHEDULE_INTERVAL_MINUTES = 30;
const DAY_NAMES_JA = ['日', '月', '火', '水', '木', '金', '土'];
const LAST_CLASS_STORAGE_KEY = 'flashcardsTeacherForm.lastClass';
const CLASS_ALIASES = Object.freeze({
  'Orion 2': 'Orion'
});

let globalVocabulary = [];
let nextVocabularyId = 1;

const elements = {
  creatorFlow: document.getElementById('creatorFlow'),
  uploadForm: document.getElementById('uploadForm'),
  classDropdown: document.getElementById('classDropdown'),
  imageFiles: document.getElementById('imageFiles'),
  fileSummary: document.getElementById('fileSummary'),
  vocabularyList: document.getElementById('vocabularyList'),
  additionalWord: document.getElementById('additionalWord'),
  addWordBtn: document.getElementById('addWordBtn'),
  selectionBar: document.getElementById('selectionBar'),
  selectionSummary: document.getElementById('selectionSummary'),
  selectAllBtn: document.getElementById('selectAllBtn'),
  clearSelectionBtn: document.getElementById('clearSelectionBtn'),
  submitVocabulary: document.getElementById('submitVocabulary'),
  schedulerSection: document.getElementById('schedulerSection')
};

function showLoading(title, text) {
  Swal.fire({
    title,
    text,
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => Swal.showLoading()
  });
}

function updateLoading(title, text) {
  Swal.update({ title, text });
}

function closeLoading() {
  if (Swal.isVisible()) {
    Swal.close();
  }
}

function showError(title, text) {
  return Swal.fire({
    icon: 'error',
    title,
    text,
    confirmButtonText: 'OK',
    confirmButtonColor: '#4f46e5'
  });
}

function showWarning(title, text) {
  return Swal.fire({
    icon: 'warning',
    title,
    text,
    confirmButtonText: 'OK',
    confirmButtonColor: '#4f46e5'
  });
}

function showToast(icon, title) {
  return Swal.fire({
    toast: true,
    position: 'top-end',
    icon,
    title,
    showConfirmButton: false,
    timer: 1900,
    timerProgressBar: true
  });
}

async function parseResponseError(response, fallbackMessage) {
  try {
    const data = await response.json();
    return data.error || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

function normalizeItemKey(text) {
  return text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function canonicalizeClassName(className) {
  const trimmedClassName = typeof className === 'string' ? className.trim() : '';
  return CLASS_ALIASES[trimmedClassName] || trimmedClassName;
}

function createVocabularyItem(text) {
  return {
    id: `vocabulary-${nextVocabularyId++}`,
    text: text.trim().replace(/\s+/g, ' '),
    selected: true
  };
}

function addVocabularyItems(items) {
  const existingKeys = new Set(globalVocabulary.map((item) => normalizeItemKey(item.text)));
  let addedCount = 0;

  for (const rawItem of items) {
    if (typeof rawItem !== 'string') {
      continue;
    }

    const text = rawItem.trim().replace(/\s+/g, ' ');
    const key = normalizeItemKey(text);
    if (!text || existingKeys.has(key)) {
      continue;
    }

    globalVocabulary.push(createVocabularyItem(text));
    existingKeys.add(key);
    addedCount += 1;
  }

  renderVocabularyList();
  return addedCount;
}

function updateSelectionUI() {
  const validItems = globalVocabulary.filter((item) => item.text.trim());
  const selectedCount = validItems.filter((item) => item.selected).length;

  elements.selectionBar.hidden = globalVocabulary.length === 0;
  elements.submitVocabulary.hidden = globalVocabulary.length === 0;
  elements.submitVocabulary.disabled = selectedCount === 0;
  elements.selectionSummary.textContent = `${selectedCount} of ${validItems.length} item${validItems.length === 1 ? '' : 's'} selected`;
}

function renderVocabularyList() {
  elements.vocabularyList.replaceChildren();

  if (globalVocabulary.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';

    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '✦';

    const message = document.createElement('p');
    message.textContent = 'No items yet. Upload photos or add one manually.';

    emptyState.append(icon, message);
    elements.vocabularyList.appendChild(emptyState);
    updateSelectionUI();
    return;
  }

  for (const item of globalVocabulary) {
    const row = document.createElement('div');
    row.className = `vocabulary-row${item.selected ? '' : ' is-unselected'}`;
    row.dataset.itemId = item.id;

    const checkbox = document.createElement('input');
    checkbox.className = 'item-checkbox';
    checkbox.type = 'checkbox';
    checkbox.checked = item.selected;
    checkbox.setAttribute('aria-label', `Include ${item.text}`);
    checkbox.addEventListener('change', () => {
      item.selected = checkbox.checked;
      row.classList.toggle('is-unselected', !item.selected);
      updateSelectionUI();
    });

    const input = document.createElement('input');
    input.className = 'item-text';
    input.type = 'text';
    input.value = item.text;
    input.setAttribute('aria-label', 'Edit study item');
    input.spellcheck = true;
    input.addEventListener('input', () => {
      item.text = input.value;
      checkbox.setAttribute('aria-label', `Include ${input.value || 'empty item'}`);
      updateSelectionUI();
    });
    input.addEventListener('blur', () => {
      item.text = input.value.trim().replace(/\s+/g, ' ');
      input.value = item.text;
      updateSelectionUI();
    });

    const removeButton = document.createElement('button');
    removeButton.className = 'icon-button';
    removeButton.type = 'button';
    removeButton.title = 'Remove item';
    removeButton.setAttribute('aria-label', `Remove ${item.text}`);
    removeButton.textContent = '×';
    removeButton.addEventListener('click', () => {
      globalVocabulary = globalVocabulary.filter((candidate) => candidate.id !== item.id);
      renderVocabularyList();
    });

    row.append(checkbox, input, removeButton);
    elements.vocabularyList.appendChild(row);
  }

  updateSelectionUI();
}

async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', 'Flashcards_Data');

  const response = await fetch('https://api.cloudinary.com/v1_1/dzo0vucxp/image/upload', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Could not upload ${file.name}.`);
  }

  const data = await response.json();
  return data.secure_url;
}

elements.imageFiles.addEventListener('change', () => {
  const files = Array.from(elements.imageFiles.files || []);
  elements.fileSummary.textContent = files.length === 0
    ? 'JPG, PNG, HEIC, or other image files'
    : `${files.length} image${files.length === 1 ? '' : 's'} selected`;
});

elements.uploadForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const files = Array.from(elements.imageFiles.files || []);
  if (!elements.classDropdown.value) {
    await showWarning('Choose a class', 'Please select the class for this flashcard set.');
    return;
  }
  if (files.length === 0) {
    await showWarning('Choose at least one image', 'Add a whiteboard or worksheet photo first.');
    return;
  }

  showLoading('Uploading lesson photos', `Uploading 1 of ${files.length}…`);

  try {
    const imageUrls = [];
    for (let index = 0; index < files.length; index += 1) {
      updateLoading('Uploading lesson photos', `Uploading ${index + 1} of ${files.length}…`);
      imageUrls.push(await uploadToCloudinary(files[index]));
    }

    updateLoading('Reading the lesson', 'AI is extracting vocabulary, phrases, and sentences…');
    const response = await fetch('/api/extractDataFromImages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrls })
    });

    if (!response.ok) {
      throw new Error(await parseResponseError(response, 'Could not extract text from the images.'));
    }

    const { processedData } = await response.json();
    const extractedItems = Array.isArray(processedData?.vocabulary) ? processedData.vocabulary : [];
    const addedCount = addVocabularyItems(extractedItems);

    elements.imageFiles.value = '';
    elements.fileSummary.textContent = 'JPG, PNG, HEIC, or other image files';
    closeLoading();

    if (addedCount === 0) {
      await showWarning('No new items found', 'Try a clearer photo, or add the lesson text manually.');
    } else {
      await showToast('success', `${addedCount} item${addedCount === 1 ? '' : 's'} added`);
    }
  } catch (error) {
    console.error('Image processing failed:', error);
    closeLoading();
    await showError('Could not process the images', error.message || 'Please try again.');
  }
});

function addManualItem() {
  const newItem = elements.additionalWord.value.trim();
  if (!newItem) {
    showWarning('Enter an item first', 'Type a word, phrase, or sentence before adding it.');
    return;
  }

  const addedCount = addVocabularyItems([newItem]);
  if (addedCount === 0) {
    showToast('info', 'That item is already in the list');
    return;
  }

  elements.additionalWord.value = '';
  elements.additionalWord.focus();
}

elements.addWordBtn.addEventListener('click', addManualItem);
elements.additionalWord.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addManualItem();
  }
});

elements.selectAllBtn.addEventListener('click', () => {
  globalVocabulary.forEach((item) => {
    item.selected = true;
  });
  renderVocabularyList();
});

elements.clearSelectionBtn.addEventListener('click', () => {
  globalVocabulary.forEach((item) => {
    item.selected = false;
  });
  renderVocabularyList();
});

function getJstParts(date = new Date()) {
  const shiftedDate = new Date(date.getTime() + JST_OFFSET_MS);
  return {
    year: shiftedDate.getUTCFullYear(),
    month: shiftedDate.getUTCMonth() + 1,
    day: shiftedDate.getUTCDate(),
    hour: shiftedDate.getUTCHours(),
    minute: shiftedDate.getUTCMinutes(),
    second: shiftedDate.getUTCSeconds()
  };
}

function getJstDatePartsForOffset(offsetDays) {
  const today = getJstParts();
  const date = new Date(Date.UTC(today.year, today.month - 1, today.day + offsetDays));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    dayOfWeek: date.getUTCDay()
  };
}

function getScheduledTimestamp(offsetDays, minutesAfterMidnight) {
  const today = getJstParts();
  const hour = Math.floor(minutesAfterMidnight / 60);
  const minute = minutesAfterMidnight % 60;
  return Date.UTC(today.year, today.month - 1, today.day + offsetDays, hour - 9, minute, 0, 0);
}

function formatTime(minutesAfterMidnight) {
  const hour = String(Math.floor(minutesAfterMidnight / 60)).padStart(2, '0');
  const minute = String(minutesAfterMidnight % 60).padStart(2, '0');
  return `${hour}:${minute}`;
}

function buildSubmissionId() {
  const now = getJstParts();
  return [
    now.year,
    String(now.month).padStart(2, '0'),
    String(now.day).padStart(2, '0'),
    String(now.hour).padStart(2, '0'),
    String(now.minute).padStart(2, '0')
  ].join('-');
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();

  if (!copied) {
    throw new Error('Copy is not available in this browser.');
  }
}

async function checkWebhookConfiguration(className) {
  const response = await fetch('/api/checkClassWebhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ className })
  });

  if (!response.ok) {
    throw new Error(await parseResponseError(response, 'Could not verify the Discord webhook.'));
  }

  return response.json();
}

function createTimeSelect(offsetDays) {
  const select = document.createElement('select');
  select.className = 'time-select';
  select.setAttribute('aria-label', 'Message time in Japan');

  const now = Date.now();
  const availableValues = [];

  for (
    let minutes = SCHEDULE_START_MINUTES;
    minutes <= SCHEDULE_END_MINUTES;
    minutes += SCHEDULE_INTERVAL_MINUTES
  ) {
    const option = document.createElement('option');
    option.value = String(minutes);
    option.textContent = formatTime(minutes);

    const isPast = getScheduledTimestamp(offsetDays, minutes) <= now;
    option.disabled = isPast;
    if (!isPast) {
      availableValues.push(minutes);
    }

    select.appendChild(option);
  }

  if (availableValues.includes(DEFAULT_SCHEDULE_MINUTES)) {
    select.value = String(DEFAULT_SCHEDULE_MINUTES);
  } else if (availableValues.length > 0) {
    select.value = String(availableValues[0]);
  }

  return { select, hasAvailableTime: availableValues.length > 0 };
}

function refreshTimeAvailability(scheduleEntry) {
  const availableOptions = [];
  for (const option of scheduleEntry.select.options) {
    const isPast = getScheduledTimestamp(scheduleEntry.offset, Number(option.value)) <= Date.now();
    option.disabled = isPast;
    if (!isPast) {
      availableOptions.push(option);
    }
  }

  if (scheduleEntry.select.selectedOptions[0]?.disabled && availableOptions.length > 0) {
    scheduleEntry.select.value = availableOptions[0].value;
  }

  const hasAvailableTime = availableOptions.length > 0;
  scheduleEntry.checkbox.disabled = !hasAvailableTime;
  if (!hasAvailableTime) {
    scheduleEntry.checkbox.checked = false;
    scheduleEntry.dateNote.textContent = 'No times left today';
  }

  scheduleEntry.select.disabled = !scheduleEntry.checkbox.checked || !hasAvailableTime;
  scheduleEntry.row.classList.toggle('is-selected', scheduleEntry.checkbox.checked);
  scheduleEntry.row.classList.toggle('is-unavailable', !hasAvailableTime);
}

function renderScheduler(dynamicURL, selectedClass) {
  elements.creatorFlow.hidden = true;
  elements.schedulerSection.hidden = false;
  elements.schedulerSection.replaceChildren();

  const header = document.createElement('div');
  header.className = 'scheduler-header';

  const successMark = document.createElement('span');
  successMark.className = 'success-mark';
  successMark.setAttribute('aria-hidden', 'true');
  successMark.textContent = '✓';

  const title = document.createElement('h2');
  title.textContent = 'Your flashcards are ready';

  const subtitle = document.createElement('p');
  subtitle.textContent = `Choose when the ${selectedClass} Discord reminder should be sent.`;
  header.append(successMark, title, subtitle);

  const shareLink = document.createElement('div');
  shareLink.className = 'share-link';

  const link = document.createElement('a');
  link.href = dynamicURL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = dynamicURL;

  const copyButton = document.createElement('button');
  copyButton.className = 'copy-button';
  copyButton.type = 'button';
  copyButton.textContent = 'Copy URL';
  copyButton.addEventListener('click', async () => {
    try {
      await copyText(dynamicURL);
      await showToast('success', 'URL copied');
    } catch (error) {
      await showError('Could not copy the URL', error.message);
    }
  });
  shareLink.append(link, copyButton);

  const scheduleTitle = document.createElement('h3');
  scheduleTitle.className = 'schedule-title';
  scheduleTitle.textContent = 'Schedule Discord reminders';

  const scheduleHelp = document.createElement('p');
  scheduleHelp.className = 'schedule-help';
  scheduleHelp.textContent = 'All times are Japan time. Today is available whenever a future time remains.';

  const scheduleList = document.createElement('div');
  scheduleList.className = 'schedule-list';
  const scheduleRows = [];

  for (let offset = 0; offset < 7; offset += 1) {
    const dateParts = getJstDatePartsForOffset(offset);
    const row = document.createElement('div');
    row.className = 'schedule-row';

    const checkbox = document.createElement('input');
    checkbox.className = 'day-checkbox';
    checkbox.type = 'checkbox';
    checkbox.setAttribute('aria-label', `Schedule ${dateParts.month}/${dateParts.day}`);

    const dateLabel = document.createElement('div');
    dateLabel.className = 'schedule-date';
    dateLabel.textContent = `${dateParts.month}/${dateParts.day} (${DAY_NAMES_JA[dateParts.dayOfWeek]})`;

    const dateNote = document.createElement('small');
    dateNote.textContent = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : '';
    if (dateNote.textContent) {
      dateLabel.appendChild(dateNote);
    }

    const { select, hasAvailableTime } = createTimeSelect(offset);
    checkbox.disabled = !hasAvailableTime;
    checkbox.checked = hasAvailableTime && (offset === 1 || offset === 3 || offset === 5);
    select.disabled = !checkbox.checked;

    if (!hasAvailableTime) {
      row.classList.add('is-unavailable');
      dateNote.textContent = 'No times left today';
      if (!dateNote.parentNode) {
        dateLabel.appendChild(dateNote);
      }
    } else if (checkbox.checked) {
      row.classList.add('is-selected');
    }

    const scheduleEntry = { offset, row, checkbox, select, dateNote };

    checkbox.addEventListener('change', async () => {
      refreshTimeAvailability(scheduleEntry);
      if (checkbox.disabled) {
        return;
      }

      const selectedCount = scheduleRows.filter((candidate) => candidate.checkbox.checked).length;
      if (selectedCount > MAX_SCHEDULE_DAYS) {
        checkbox.checked = false;
        row.classList.remove('is-selected');
        select.disabled = true;
        await showWarning('Maximum six days', 'You can schedule this URL for up to six days.');
        return;
      }

      select.disabled = !checkbox.checked;
      row.classList.toggle('is-selected', checkbox.checked);
    });

    select.addEventListener('focus', () => refreshTimeAvailability(scheduleEntry));
    select.addEventListener('pointerdown', () => refreshTimeAvailability(scheduleEntry));

    row.append(checkbox, dateLabel, select);
    scheduleList.appendChild(row);
    scheduleRows.push(scheduleEntry);
  }

  const note = document.createElement('p');
  note.className = 'schedule-note';
  note.textContent = 'You can select up to six days. Available times run from 09:00 to 20:00 in 30-minute intervals.';

  const bookingButton = document.createElement('button');
  bookingButton.id = 'bookingButton';
  bookingButton.className = 'btn btn-primary';
  bookingButton.type = 'button';
  bookingButton.textContent = 'Reserve Discord messages';

  bookingButton.addEventListener('click', async () => {
    scheduleRows.forEach(refreshTimeAvailability);
    const selectedRows = scheduleRows.filter(({ checkbox }) => checkbox.checked && !checkbox.disabled);

    if (selectedRows.length === 0) {
      await showWarning('Choose at least one day', 'Select when the Discord reminder should be sent.');
      return;
    }
    if (selectedRows.length > MAX_SCHEDULE_DAYS) {
      await showWarning('Maximum six days', 'Please deselect at least one day.');
      return;
    }

    const tasks = selectedRows.map(({ offset, select }) => ({
      className: selectedClass,
      dynamicURL,
      scheduledTime: getScheduledTimestamp(offset, Number(select.value)),
      status: 'not_sent',
      createdAt: Date.now(),
      timeZone: 'Asia/Tokyo'
    }));

    if (tasks.some((task) => task.scheduledTime <= Date.now())) {
      await showWarning('That time has passed', 'Choose a later time for today, then try again.');
      return;
    }

    showLoading('Checking Discord', `Verifying the webhook for ${selectedClass}…`);

    try {
      const webhookStatus = await checkWebhookConfiguration(selectedClass);
      if (!webhookStatus.configured) {
        closeLoading();
        await showError(
          'Discord webhook not configured',
          `Add a DiscordWebhooks/${selectedClass} document with a webhookURLs array in Firestore, then try again.`
        );
        return;
      }

      updateLoading('Reserving messages', `Saving ${tasks.length} Discord reminder${tasks.length === 1 ? '' : 's'}…`);
      const batch = db.batch();
      for (const task of tasks) {
        const taskRef = db.collection('ScheduledMessages').doc();
        batch.set(taskRef, task);
      }
      await batch.commit();

      closeLoading();
      await Swal.fire({
        icon: 'success',
        title: 'Reservation complete',
        text: `${tasks.length} Discord message${tasks.length === 1 ? ' is' : 's are'} scheduled.`,
        confirmButtonText: 'Done',
        confirmButtonColor: '#4f46e5'
      });

      scheduleRows.forEach(({ checkbox, select }) => {
        checkbox.disabled = true;
        select.disabled = true;
      });
      bookingButton.disabled = true;
      bookingButton.textContent = 'Messages reserved';
    } catch (error) {
      console.error('Scheduling failed:', error);
      closeLoading();
      await showError('Could not reserve the messages', error.message || 'Please try again.');
    }
  });

  elements.schedulerSection.append(
    header,
    shareLink,
    scheduleTitle,
    scheduleHelp,
    scheduleList,
    note,
    bookingButton
  );
  elements.schedulerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

elements.submitVocabulary.addEventListener('click', async () => {
  const selectedClass = elements.classDropdown.value;
  const selectedVocabulary = [];
  const seen = new Set();

  for (const item of globalVocabulary) {
    const text = item.text.trim().replace(/\s+/g, ' ');
    const key = normalizeItemKey(text);
    if (item.selected && text && !seen.has(key)) {
      selectedVocabulary.push(text);
      seen.add(key);
    }
  }

  if (!selectedClass) {
    await showWarning('Choose a class', 'Please select the class for this flashcard set.');
    return;
  }
  if (selectedVocabulary.length === 0) {
    await showWarning('Select at least one item', 'Choose at least one non-empty item for the flashcards.');
    return;
  }

  showLoading(
    'Creating the flashcards',
    'Generating translations, examples, and speech. This can take a little while…'
  );

  try {
    const response = await fetch('/api/createDataFromList', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ words: selectedVocabulary })
    });

    if (!response.ok) {
      throw new Error(await parseResponseError(response, 'Could not create the flashcard data.'));
    }

    const { processedList } = await response.json();
    if (!Array.isArray(processedList) || processedList.length === 0) {
      throw new Error('The flashcard generator returned no items.');
    }

    updateLoading('Saving the flashcards', `Saving this set for ${selectedClass}…`);
    const docId = buildSubmissionId();
    const submissionRef = db
      .collection('Academic-classes')
      .doc(selectedClass)
      .collection('Submissions')
      .doc(docId);

    await submissionRef.set({
      Vocabulary: processedList,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    const dynamicURL = `https://flashcards-opal-seven.vercel.app/${encodeURIComponent(selectedClass)}/${encodeURIComponent(docId)}`;
    closeLoading();
    renderScheduler(dynamicURL, selectedClass);
  } catch (error) {
    console.error('Flashcard creation failed:', error);
    closeLoading();
    await showError('Could not create the flashcards', error.message || 'Please try again.');
  }
});

async function populateClassDropdown() {
  elements.classDropdown.disabled = true;
  elements.classDropdown.replaceChildren(new Option('Loading classes…', ''));

  try {
    const snapshot = await db.collection('Academic-classes').get();
    const classNames = Array.from(new Set(snapshot.docs
      .map((documentSnapshot) => canonicalizeClassName(documentSnapshot.id))
      .filter(Boolean)))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));

    if (classNames.length === 0) {
      throw new Error('No class documents were found in Academic-classes.');
    }

    elements.classDropdown.replaceChildren();
    for (const className of classNames) {
      elements.classDropdown.appendChild(new Option(className, className));
    }

    const lastClass = canonicalizeClassName(localStorage.getItem(LAST_CLASS_STORAGE_KEY));
    if (lastClass && classNames.includes(lastClass)) {
      elements.classDropdown.value = lastClass;
    }
    elements.classDropdown.disabled = false;
  } catch (error) {
    console.error('Class loading failed:', error);
    elements.classDropdown.replaceChildren(new Option('Could not load classes', ''));
    await showError('Could not load the classes', error.message || 'Check Firestore and reload the page.');
  }
}

elements.classDropdown.addEventListener('change', () => {
  if (elements.classDropdown.value) {
    localStorage.setItem(LAST_CLASS_STORAGE_KEY, elements.classDropdown.value);
  }
});

renderVocabularyList();
populateClassDropdown();
