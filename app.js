// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(registration => console.log('SW registered'))
            .catch(err => console.log('SW failed: ', err));
    });
}

// State
let songs = [];
let setlists = [];
let currentView = 'list';
let currentTranspose = 0;
let activeSetlistId = null; // When viewing a setlist detail or playing through it
let currentSongIndex = -1; // Index of the current song within the active setlist

const storageKeySongs = 'chordTracker_songs';
const storageKeySetlists = 'chordTracker_setlists';

// Music Constants
const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const flatNotes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// DOM Elements
const views = {
    list: document.getElementById('view-list'),
    editor: document.getElementById('view-editor'),
    viewer: document.getElementById('view-viewer'),
    setlistDetail: document.getElementById('view-setlist-detail'),
    setlistSelector: document.getElementById('view-setlist-selector')
};

const headerElements = {
    title: document.getElementById('viewTitle'),
    backBtn: document.getElementById('backBtn'),
    addBtn: document.getElementById('addSongBtn'),
    saveBtn: document.getElementById('saveSongBtn'),
    editBtn: document.getElementById('editSongBtn')
};

const listElements = {
    tabSongsBtn: document.getElementById('tabSongsBtn'),
    tabSetlistsBtn: document.getElementById('tabSetlistsBtn'),
    songsTabContent: document.getElementById('songsTabContent'),
    setlistsTabContent: document.getElementById('setlistsTabContent'),
    
    songList: document.getElementById('songList'),
    emptyState: document.getElementById('emptyState'),
    searchInput: document.getElementById('searchInput'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    importFile: document.getElementById('importFile'),

    createSetlistBtn: document.getElementById('createSetlistBtn'),
    setlistList: document.getElementById('setlistList'),
    emptySetlistState: document.getElementById('emptySetlistState')
};

const setlistDetailElements = {
    title: document.getElementById('setlistDetailTitle'),
    count: document.getElementById('setlistDetailCount'),
    list: document.getElementById('setlistDetailList'),
    emptyState: document.getElementById('emptySetlistDetailState'),
    addSongsBtn: document.getElementById('addSongsToSetlistBtn'),
    deleteBtn: document.getElementById('deleteSetlistBtn')
};

const setlistSelectorElements = {
    list: document.getElementById('selectorList')
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

// Initialize
async function init() {
    localforage.config({ name: 'ChordTracker', storeName: 'songs' });
    await loadData();
    history.replaceState({ view: 'list', id: null, activeSetlist: null }, '', '');
    
    window.addEventListener('popstate', (e) => {
        if (e.state) {
            activeSetlistId = e.state.activeSetlist || null;
            doNavigateTo(e.state.view, e.state.id);
        } else {
            doNavigateTo('list');
        }
    });

    renderSongs();
    renderSetlists();
    setupEventListeners();
}

async function loadData() {
    try {
        const storedSongs = await localforage.getItem(storageKeySongs);
        if (storedSongs) songs = storedSongs;
        
        const storedSetlists = await localforage.getItem(storageKeySetlists);
        if (storedSetlists) setlists = storedSetlists;
    } catch (err) { console.error('Error loading:', err); }
}

async function saveData() {
    try {
        await localforage.setItem(storageKeySongs, songs);
        await localforage.setItem(storageKeySetlists, setlists);
    } catch (err) { console.error('Error saving:', err); }
}

// Navigation
function doNavigateTo(view, dataId = null) {
    Object.values(views).forEach(v => v.classList.remove('active', 'hidden'));
    
    setTimeout(() => {
        Object.values(views).forEach(v => {
            if (v.id !== `view-${view}`) v.classList.add('hidden');
        });
    }, 300);

    views[view].classList.remove('hidden');
    void views[view].offsetWidth; // trigger reflow
    views[view].classList.add('active');

    currentView = view;
    updateHeader(view, dataId);
}

function navigateTo(view, dataId = null, replace = false) {
    if (replace) {
        history.replaceState({ view, id: dataId, activeSetlist: activeSetlistId }, '', '');
    } else {
        history.pushState({ view, id: dataId, activeSetlist: activeSetlistId }, '', '');
    }
    doNavigateTo(view, dataId);
}

function updateHeader(view, dataId) {
    headerElements.backBtn.classList.add('hidden');
    headerElements.addBtn.classList.add('hidden');
    headerElements.saveBtn.classList.add('hidden');
    headerElements.editBtn.classList.add('hidden');

    if (view === 'list') {
        headerElements.title.textContent = 'My Songs';
        headerElements.addBtn.classList.remove('hidden');
        renderSongs(); 
        renderSetlists();
    } else if (view === 'editor') {
        headerElements.title.textContent = dataId ? 'Edit Song' : 'New Song';
        headerElements.backBtn.classList.remove('hidden');
        headerElements.saveBtn.classList.remove('hidden');
    } else if (view === 'viewer') {
        const song = songs.find(s => s.id === dataId);
        headerElements.title.textContent = song ? song.title : 'Song';
        headerElements.backBtn.classList.remove('hidden');
        headerElements.editBtn.classList.remove('hidden');
        headerElements.editBtn.dataset.id = dataId;
    } else if (view === 'setlistDetail') {
        headerElements.title.textContent = 'Setlist';
        headerElements.backBtn.classList.remove('hidden');
        renderSetlistDetail(dataId);
    } else if (view === 'setlistSelector') {
        headerElements.title.textContent = 'Select Songs';
        headerElements.backBtn.classList.remove('hidden');
        renderSetlistSelector(dataId);
    }
}

// Renderers
function renderSongs(searchQuery = '') {
    listElements.songList.innerHTML = '';
    const filtered = songs.filter(song => {
        const q = searchQuery.toLowerCase();
        return song.title.toLowerCase().includes(q) || (song.artist && song.artist.toLowerCase().includes(q));
    });

    if (filtered.length === 0) {
        if (searchQuery === '' && songs.length === 0) {
            listElements.emptyState.classList.remove('hidden');
        } else {
            listElements.emptyState.classList.add('hidden');
            listElements.songList.innerHTML = '<p style="text-align:center; color:var(--text-secondary); margin-top: 20px;">No matches found.</p>';
        }
        return;
    }

    listElements.emptyState.classList.add('hidden');
    filtered.sort((a, b) => a.title.localeCompare(b.title));

    filtered.forEach(song => {
        const el = document.createElement('div');
        el.className = 'song-item';
        el.innerHTML = `
            <div class="song-item-title">${escapeHTML(song.title)}</div>
            ${song.artist ? `<div class="song-item-artist">${escapeHTML(song.artist)}</div>` : ''}
        `;
        el.addEventListener('click', () => {
            activeSetlistId = null; // Normal play
            openViewer(song.id);
        });
        listElements.songList.appendChild(el);
    });
}

function renderSetlists() {
    listElements.setlistList.innerHTML = '';
    if (setlists.length === 0) {
        listElements.emptySetlistState.classList.remove('hidden');
        return;
    }
    
    listElements.emptySetlistState.classList.add('hidden');
    setlists.forEach(sl => {
        const el = document.createElement('div');
        el.className = 'song-item';
        el.innerHTML = `
            <div class="song-item-title">${escapeHTML(sl.name)}</div>
            <div class="song-item-artist">${sl.songIds.length} songs</div>
        `;
        el.addEventListener('click', () => {
            activeSetlistId = sl.id;
            navigateTo('setlistDetail', sl.id);
        });
        listElements.setlistList.appendChild(el);
    });
}

function renderSetlistDetail(setId) {
    const sl = setlists.find(s => s.id === setId);
    if (!sl) return navigateTo('list');

    setlistDetailElements.title.textContent = sl.name;
    setlistDetailElements.count.textContent = `${sl.songIds.length} songs`;
    
    setlistDetailElements.list.innerHTML = '';
    
    if (sl.songIds.length === 0) {
        setlistDetailElements.emptyState.classList.remove('hidden');
    } else {
        setlistDetailElements.emptyState.classList.add('hidden');
        sl.songIds.forEach((songId, index) => {
            const song = songs.find(s => s.id === songId);
            if (!song) return; // Song was deleted

            const el = document.createElement('div');
            el.className = 'song-item';
            el.innerHTML = `
                <div class="song-item-title">${index + 1}. ${escapeHTML(song.title)}</div>
                ${song.artist ? `<div class="song-item-artist">${escapeHTML(song.artist)}</div>` : ''}
            `;
            el.addEventListener('click', () => {
                currentSongIndex = index;
                openViewer(song.id);
            });
            setlistDetailElements.list.appendChild(el);
        });
    }
}

function renderSetlistSelector(setId) {
    const sl = setlists.find(s => s.id === setId);
    if (!sl) return;

    setlistSelectorElements.list.innerHTML = '';
    const sortedSongs = [...songs].sort((a, b) => a.title.localeCompare(b.title));
    
    sortedSongs.forEach(song => {
        const isSelected = sl.songIds.includes(song.id);
        const el = document.createElement('div');
        el.className = `song-item ${isSelected ? 'selected' : ''}`;
        el.innerHTML = `
            <div class="song-item-title">${escapeHTML(song.title)}</div>
            ${song.artist ? `<div class="song-item-artist">${escapeHTML(song.artist)}</div>` : ''}
        `;
        
        el.addEventListener('click', async () => {
            if (sl.songIds.includes(song.id)) {
                sl.songIds = sl.songIds.filter(id => id !== song.id);
                el.classList.remove('selected');
            } else {
                sl.songIds.push(song.id);
                el.classList.add('selected');
            }
            await saveData();
        });
        setlistSelectorElements.list.appendChild(el);
    });
}

function openViewer(id, replace = false) {
    const song = songs.find(s => s.id === id);
    if (!song) return;
    
    currentTranspose = 0;
    viewerElements.title.textContent = song.title;
    viewerElements.artist.textContent = song.artist || '';
    
    // Add Setlist context if applicable
    if (activeSetlistId) {
        const sl = setlists.find(s => s.id === activeSetlistId);
        if (sl) {
            viewerElements.artist.textContent = `${song.artist || 'Unknown'}  •  ${currentSongIndex + 1}/${sl.songIds.length} in ${sl.name}`;
        }
    }

    viewerElements.transposeLabel.textContent = "0";
    viewerElements.chords.innerHTML = transposeChords(song.chords, 0);
    
    navigateTo('viewer', id, replace);
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

// Swipe Logic for Viewer
let touchStartX = 0;
let touchEndX = 0;

function handleSwipe() {
    if (currentView !== 'viewer' || !activeSetlistId) return;
    const sl = setlists.find(s => s.id === activeSetlistId);
    if (!sl) return;

    const swipeThreshold = 50;
    if (touchEndX < touchStartX - swipeThreshold) {
        // Swiped left -> Next Song
        if (currentSongIndex < sl.songIds.length - 1) {
            currentSongIndex++;
            openViewer(sl.songIds[currentSongIndex], true);
        }
    }
    if (touchEndX > touchStartX + swipeThreshold) {
        // Swiped right -> Previous Song
        if (currentSongIndex > 0) {
            currentSongIndex--;
            openViewer(sl.songIds[currentSongIndex], true);
        }
    }
}

// Event Listeners
function setupEventListeners() {
    // Tabs
    listElements.tabSongsBtn.addEventListener('click', () => {
        listElements.tabSongsBtn.style.background = 'var(--bg-surface-elevated)';
        listElements.tabSongsBtn.style.color = 'var(--text-primary)';
        listElements.tabSetlistsBtn.style.background = 'transparent';
        listElements.tabSetlistsBtn.style.color = 'var(--text-secondary)';
        
        listElements.songsTabContent.classList.remove('hidden');
        listElements.setlistsTabContent.classList.add('hidden');
    });

    listElements.tabSetlistsBtn.addEventListener('click', () => {
        listElements.tabSetlistsBtn.style.background = 'var(--bg-surface-elevated)';
        listElements.tabSetlistsBtn.style.color = 'var(--text-primary)';
        listElements.tabSongsBtn.style.background = 'transparent';
        listElements.tabSongsBtn.style.color = 'var(--text-secondary)';
        
        listElements.setlistsTabContent.classList.remove('hidden');
        listElements.songsTabContent.classList.add('hidden');
    });

    // Header Actions
    headerElements.addBtn.addEventListener('click', () => openEditor());
    headerElements.backBtn.addEventListener('click', () => {
        history.back();
    });
    headerElements.saveBtn.addEventListener('click', async () => {
        const id = editorElements.id.value;
        const title = editorElements.title.value.trim();
        const artist = editorElements.artist.value.trim();
        const chords = editorElements.chords.value.trim();
        if (!title) return alert('Title is required!');

        const songData = { id: id || Date.now().toString(), title, artist, chords, updatedAt: Date.now() };
        if (id) {
            const index = songs.findIndex(s => s.id === id);
            if (index !== -1) songs[index] = songData;
        } else {
            songs.push(songData);
        }
        await saveData();
        openViewer(songData.id, true);
    });

    headerElements.editBtn.addEventListener('click', (e) => {
        openEditor(e.currentTarget.dataset.id);
    });

    // Editor Actions
    editorElements.deleteBtn.addEventListener('click', async () => {
        const id = editorElements.id.value;
        if (!id) return;
        if (confirm('Are you sure you want to delete this song?')) {
            songs = songs.filter(s => s.id !== id);
            // Also remove from all setlists
            setlists.forEach(sl => {
                sl.songIds = sl.songIds.filter(sid => sid !== id);
            });
            await saveData();
            navigateTo('list', null, true);
        }
    });

    // Viewer Actions
    viewerElements.transposeUpBtn.addEventListener('click', () => updateTranspose(1));
    viewerElements.transposeDownBtn.addEventListener('click', () => updateTranspose(-1));

    document.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, {passive: true});
    document.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, {passive: true});

    // Setlist Actions
    listElements.createSetlistBtn.addEventListener('click', async () => {
        const name = prompt("Enter setlist name:");
        if (name && name.trim()) {
            const newSetlist = {
                id: 'set_' + Date.now(),
                name: name.trim(),
                songIds: []
            };
            setlists.push(newSetlist);
            await saveData();
            activeSetlistId = newSetlist.id;
            navigateTo('setlistDetail', newSetlist.id);
        }
    });

    setlistDetailElements.addSongsBtn.addEventListener('click', () => {
        navigateTo('setlistSelector', activeSetlistId);
    });

    setlistDetailElements.deleteBtn.addEventListener('click', async () => {
        if (confirm("Delete this setlist? Your songs will NOT be deleted.")) {
            setlists = setlists.filter(s => s.id !== activeSetlistId);
            await saveData();
            navigateTo('list', null, true);
        }
    });

    // Search & Import/Export
    listElements.searchInput.addEventListener('input', (e) => renderSongs(e.target.value));

    listElements.exportBtn.addEventListener('click', () => {
        const backupData = { songs, setlists };
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'chordtracker_backup.json';
        a.click();
        URL.revokeObjectURL(url);
    });

    listElements.importBtn.addEventListener('click', () => listElements.importFile.click());
    listElements.importFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (Array.isArray(data)) {
                    // Old format: just array of songs
                    importSongs(data);
                } else if (data.songs) {
                    // New format
                    importSongs(data.songs);
                    if (data.setlists) importSetlists(data.setlists);
                } else {
                    alert('Invalid file format.');
                }
                await saveData();
                renderSongs();
                renderSetlists();
                alert('Successfully imported!');
            } catch (err) { alert('Error parsing file.'); }
        };
        reader.readAsText(file);
        e.target.value = '';
    });
}

function importSongs(importedSongs) {
    const songMap = new Map(songs.map(s => [s.id, s]));
    importedSongs.forEach(s => {
        if (s.id && s.title) songMap.set(s.id, s);
    });
    songs = Array.from(songMap.values());
}
function importSetlists(importedSetlists) {
    const setMap = new Map(setlists.map(s => [s.id, s]));
    importedSetlists.forEach(s => {
        if (s.id && s.name) setMap.set(s.id, s);
    });
    setlists = Array.from(setMap.values());
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

// Utils
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[tag]));
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
    if (amount === 0) return escapeHTML(text).replace(/\[(.*?)\]/g, '<span style="color: var(--text-secondary);">$1</span>');

    let tokens = text.split(/(\[.*?\])/);
    for (let i = 0; i < tokens.length; i++) {
        if (!tokens[i].startsWith('[')) {
            tokens[i] = tokens[i].replace(/(^|[^a-zA-Z])([A-G][#b]?)([A-Za-z0-9\/]*)/g, (match, prefix, root, suffix) => {
                let shiftedRoot = shiftNote(root, amount);
                let shiftedSuffix = suffix.replace(/\/([A-G][#b]?)/g, (m, bass) => '/' + shiftNote(bass, amount));
                return prefix + shiftedRoot + shiftedSuffix;
            });
        }
    }
    return escapeHTML(tokens.join('')).replace(/\[(.*?)\]/g, '<span style="color: var(--text-secondary);">$1</span>');
}

// Boot
init();
