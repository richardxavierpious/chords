// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful');
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}

// State
let songs = [];
let currentView = 'list';
let currentTranspose = 0;
const storageKey = 'chordTracker_songs';

// Music Constants
const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const flatNotes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// DOM Elements
const views = {
    list: document.getElementById('view-list'),
    editor: document.getElementById('view-editor'),
    viewer: document.getElementById('view-viewer')
};

const headerElements = {
    title: document.getElementById('viewTitle'),
    backBtn: document.getElementById('backBtn'),
    addBtn: document.getElementById('addSongBtn'),
    saveBtn: document.getElementById('saveSongBtn'),
    editBtn: document.getElementById('editSongBtn')
};

const listElements = {
    container: document.getElementById('songList'),
    emptyState: document.getElementById('emptyState'),
    searchInput: document.getElementById('searchInput'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    importFile: document.getElementById('importFile')
};

const editorElements = {
    id: document.getElementById('editSongId'),
    title: document.getElementById('editTitle'),
    artist: document.getElementById('editArtist'),
    chords: document.getElementById('editChords'),
    actions: document.getElementById('editorActions'),
    deleteBtn: document.getElementById('deleteSongBtn')
};

const viewerElements = {
    title: document.getElementById('viewerTitle'),
    artist: document.getElementById('viewerArtist'),
    chords: document.getElementById('viewerChords'),
    transposeUpBtn: document.getElementById('transposeUpBtn'),
    transposeDownBtn: document.getElementById('transposeDownBtn'),
    transposeLabel: document.getElementById('transposeLabel')
};

// Initialize App
async function init() {
    // Configure localforage
    localforage.config({
        name: 'ChordTracker',
        storeName: 'songs'
    });

    await loadSongs();
    renderList();
    setupEventListeners();
}

async function loadSongs() {
    try {
        const stored = await localforage.getItem(storageKey);
        if (stored) {
            songs = stored;
        }
    } catch (err) {
        console.error('Error loading songs:', err);
    }
}

async function saveSongs() {
    try {
        await localforage.setItem(storageKey, songs);
    } catch (err) {
        console.error('Error saving songs:', err);
    }
}

// Navigation
function navigateTo(view, songId = null) {
    // Hide all views
    Object.values(views).forEach(v => v.classList.remove('active', 'hidden'));
    
    // Slight delay for animation on hide, then hide completely
    setTimeout(() => {
        Object.values(views).forEach(v => {
            if (v.id !== `view-${view}`) v.classList.add('hidden');
        });
    }, 300);

    // Show target view
    views[view].classList.remove('hidden');
    // Trigger reflow
    void views[view].offsetWidth;
    views[view].classList.add('active');

    currentView = view;
    updateHeader(view, songId);
}

function updateHeader(view, songId) {
    headerElements.backBtn.classList.add('hidden');
    headerElements.addBtn.classList.add('hidden');
    headerElements.saveBtn.classList.add('hidden');
    headerElements.editBtn.classList.add('hidden');

    if (view === 'list') {
        headerElements.title.textContent = 'My Songs';
        headerElements.addBtn.classList.remove('hidden');
        renderList(); // Refresh list when going back
    } else if (view === 'editor') {
        headerElements.title.textContent = songId ? 'Edit Song' : 'New Song';
        headerElements.backBtn.classList.remove('hidden');
        headerElements.saveBtn.classList.remove('hidden');
    } else if (view === 'viewer') {
        const song = songs.find(s => s.id === songId);
        headerElements.title.textContent = song ? song.title : 'Song';
        headerElements.backBtn.classList.remove('hidden');
        headerElements.editBtn.classList.remove('hidden');
        // Attach current song ID to edit button dataset
        headerElements.editBtn.dataset.id = songId;
    }
}

// Renderers
function renderList(searchQuery = '') {
    listElements.container.innerHTML = '';
    
    const filteredSongs = songs.filter(song => {
        const query = searchQuery.toLowerCase();
        return song.title.toLowerCase().includes(query) || 
               (song.artist && song.artist.toLowerCase().includes(query));
    });

    if (filteredSongs.length === 0) {
        if (searchQuery === '' && songs.length === 0) {
            listElements.emptyState.classList.remove('hidden');
        } else {
            listElements.emptyState.classList.add('hidden');
            listElements.container.innerHTML = '<p style="text-align:center; color:var(--text-secondary); margin-top: 20px;">No matches found.</p>';
        }
        return;
    }

    listElements.emptyState.classList.add('hidden');

    // Sort alphabetically by title
    filteredSongs.sort((a, b) => a.title.localeCompare(b.title));

    filteredSongs.forEach(song => {
        const el = document.createElement('div');
        el.className = 'song-item';
        el.innerHTML = `
            <div class="song-item-title">${escapeHTML(song.title)}</div>
            ${song.artist ? `<div class="song-item-artist">${escapeHTML(song.artist)}</div>` : ''}
        `;
        el.addEventListener('click', () => openViewer(song.id));
        listElements.container.appendChild(el);
    });
}

function openViewer(id) {
    const song = songs.find(s => s.id === id);
    if (!song) return;
    
    currentTranspose = 0;
    viewerElements.title.textContent = song.title;
    viewerElements.artist.textContent = song.artist || '';
    
    viewerElements.transposeLabel.textContent = "0";
    viewerElements.chords.innerHTML = transposeChords(song.chords, 0);
    
    navigateTo('viewer', id);
}

function updateTranspose(amount) {
    currentTranspose += amount;
    const songId = headerElements.editBtn.dataset.id;
    const song = songs.find(s => s.id === songId);
    if (song) {
        viewerElements.transposeLabel.textContent = currentTranspose > 0 ? `+${currentTranspose}` : currentTranspose;
        viewerElements.chords.innerHTML = transposeChords(song.chords, currentTranspose);
    }
}

function openEditor(id = null) {
    if (id) {
        const song = songs.find(s => s.id === id);
        if (song) {
            editorElements.id.value = song.id;
            editorElements.title.value = song.title;
            editorElements.artist.value = song.artist || '';
            editorElements.chords.value = song.chords;
            editorElements.actions.classList.remove('hidden');
        }
    } else {
        editorElements.id.value = '';
        editorElements.title.value = '';
        editorElements.artist.value = '';
        editorElements.chords.value = '';
        editorElements.actions.classList.add('hidden');
    }
    navigateTo('editor', id);
}

// Actions
async function saveCurrentSong() {
    const id = editorElements.id.value;
    const title = editorElements.title.value.trim();
    const artist = editorElements.artist.value.trim();
    const chords = editorElements.chords.value.trim();

    if (!title) {
        alert('Title is required!');
        return;
    }

    const songData = {
        id: id || Date.now().toString(),
        title,
        artist,
        chords,
        updatedAt: Date.now()
    };

    if (id) {
        const index = songs.findIndex(s => s.id === id);
        if (index !== -1) songs[index] = songData;
    } else {
        songs.push(songData);
    }

    await saveSongs();
    
    // Go to viewer for the newly saved song
    openViewer(songData.id);
}

async function deleteCurrentSong() {
    const id = editorElements.id.value;
    if (!id) return;

    if (confirm('Are you sure you want to delete this song?')) {
        songs = songs.filter(s => s.id !== id);
        await saveSongs();
        navigateTo('list');
    }
}

// Event Listeners
function setupEventListeners() {
    headerElements.addBtn.addEventListener('click', () => openEditor());
    headerElements.backBtn.addEventListener('click', () => {
        if (currentView === 'editor' && editorElements.id.value) {
            // Cancel edit, go back to viewer
            navigateTo('viewer', editorElements.id.value);
        } else {
            navigateTo('list');
        }
    });
    headerElements.saveBtn.addEventListener('click', saveCurrentSong);
    headerElements.editBtn.addEventListener('click', (e) => {
        openEditor(e.currentTarget.dataset.id);
    });

    editorElements.deleteBtn.addEventListener('click', deleteCurrentSong);

    listElements.searchInput.addEventListener('input', (e) => {
        renderList(e.target.value);
    });

    viewerElements.transposeUpBtn.addEventListener('click', () => updateTranspose(1));
    viewerElements.transposeDownBtn.addEventListener('click', () => updateTranspose(-1));

    listElements.exportBtn.addEventListener('click', () => {
        if (songs.length === 0) return alert('No songs to export!');
        const blob = new Blob([JSON.stringify(songs, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'chordtracker_songs.json';
        a.click();
        URL.revokeObjectURL(url);
    });

    listElements.importBtn.addEventListener('click', () => {
        listElements.importFile.click();
    });

    listElements.importFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const importedSongs = JSON.parse(event.target.result);
                if (Array.isArray(importedSongs)) {
                    const songMap = new Map(songs.map(s => [s.id, s]));
                    importedSongs.forEach(s => {
                        if (s.id && s.title) songMap.set(s.id, s);
                    });
                    songs = Array.from(songMap.values());
                    await saveSongs();
                    renderList();
                    alert('Successfully imported songs!');
                } else {
                    alert('Invalid file format.');
                }
            } catch (err) {
                alert('Error parsing file.');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    });
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag])
    );
}

function shiftNote(note, amount) {
    let noteArray = notes;
    let index = noteArray.indexOf(note);
    if (index === -1) {
        noteArray = flatNotes;
        index = noteArray.indexOf(note);
    }
    if (index === -1) return note; 
    
    let newIndex = (index + amount) % 12;
    if (newIndex < 0) newIndex += 12;
    return noteArray[newIndex];
}

function transposeChords(text, amount) {
    if (amount === 0) {
        return escapeHTML(text).replace(/\[(.*?)\]/g, '<span style="color: var(--text-secondary);">$1</span>');
    }

    let tokens = text.split(/(\[.*?\])/);
    for (let i = 0; i < tokens.length; i++) {
        if (!tokens[i].startsWith('[')) {
            // Find A-G followed by optional #/b, preserving surrounding text
            tokens[i] = tokens[i].replace(/(^|[^a-zA-Z])([A-G][#b]?)([A-Za-z0-9\/]*)/g, (match, prefix, root, suffix) => {
                let shiftedRoot = shiftNote(root, amount);
                let shiftedSuffix = suffix.replace(/\/([A-G][#b]?)/g, (m, bass) => '/' + shiftNote(bass, amount));
                return prefix + shiftedRoot + shiftedSuffix;
            });
        }
    }
    
    let result = tokens.join('');
    return escapeHTML(result).replace(/\[(.*?)\]/g, '<span style="color: var(--text-secondary);">$1</span>');
}

// Boot
init();
