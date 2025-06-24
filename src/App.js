import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, addDoc, query, onSnapshot, serverTimestamp, doc, updateDoc } from "firebase/firestore";

// --- Import the dedicated CSS file for styling ---
import './App.css';

// --- Helper component for icons ---
const Icon = ({ path, className = "w-5 h-5" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d={path} clipRule="evenodd" />
    </svg>
);

const App = () => {
    // State for image handling
    const [selectedImage, setSelectedImage] = useState(null);
    const [extractedText, setExtractedText] = useState('');
    const [translatedText, setTranslatedText] = useState('');
    const [contextualInfo, setContextualInfo] = useState('');
    const [targetLanguage, setTargetLanguage] = useState('English');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [overlayedImage, setOverlayedImage] = useState(null);

    // States for camera functionality
    const [isCameraActive, setIsCameraActive] = useState(false);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const mediaStreamRef = useRef(null);

    // Firebase related states
    const [firestoreDb, setFirestoreDb] = useState(null);
    const [firebaseAuth, setFirebaseAuth] = useState(null);
    const [authReady, setAuthReady] = useState(false);
    const firestoreHistoryUnsubscribeRef = useRef(null);
    const isFirebaseInitializedRef = useRef(false);

    // State for translation history
    const [history, setHistory] = useState([]); 

    // State for Note Modal
    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
    const [currentNote, setCurrentNote] = useState('');
    const [currentHistoryItemId, setCurrentHistoryItemId] = useState(null);

    const languages = [
        'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Hindi',
        'Chinese (Simplified)', 'Japanese', 'Korean', 'Arabic', 'Russian', 'Bengali',
        'Punjabi', 'Telugu', 'Marathi', 'Tamil', 'Urdu', 'Gujarati', 'Kannada', 'Malayalam'
    ];
    
    // Your actual Firebase config object that you pasted in earlier
    const firebaseConfig = {
  apiKey: "AIzaSyCL0f_OsTQWgnzZ2UDQ6b3b-otWImHurf8",
  authDomain: "multilingualimagetxttranslator.firebaseapp.com",
  projectId: "multilingualimagetxttranslator",
  storageBucket: "multilingualimagetxttranslator.firebasestorage.app",
  messagingSenderId: "1011330151586",
  appId: "1:1011330151586:web:aac8f7c5e9b2bdcbc053fb",
  measurementId: "G-5LXN22CP2K"
};

    const currentAppId = firebaseConfig.appId || 'default-app-id';

    useEffect(() => {
        const initFirebase = async () => {
            if (isFirebaseInitializedRef.current) return;
            isFirebaseInitializedRef.current = true;

            try {
                const appInstance = initializeApp(firebaseConfig);
                const dbInstance = getFirestore(appInstance);
                const authInstance = getAuth(appInstance);

                setFirestoreDb(dbInstance);
                setFirebaseAuth(authInstance);

                onAuthStateChanged(authInstance, async (user) => {
                    if (!user) {
                        try {
                            await signInAnonymously(authInstance);
                        } catch (authError) {
                            setError(`Authentication failed: ${authError.message}`);
                        }
                    } else {
                        setAuthReady(true);
                    }
                });

            } catch (err) {
                setError(`Failed to load Firebase services. Did you paste your config correctly? Error: ${err.message}`);
            }
        };

        initFirebase();

        return () => {
            if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach(track => track.stop());
            }
            if (firestoreHistoryUnsubscribeRef.current) {
                firestoreHistoryUnsubscribeRef.current();
            }
        };
    }, []); 

    useEffect(() => {
        if (authReady && firestoreDb && firebaseAuth?.currentUser) {
            const collectionPath = `artifacts/${currentAppId}/users/${firebaseAuth.currentUser.uid}/translations`;
            const q = query(collection(firestoreDb, collectionPath));
            
            const unsubscribeHistory = onSnapshot(q, (snapshot) => {
                const historyData = [];
                snapshot.forEach((doc) => {
                    historyData.push({ id: doc.id, ...doc.data() });
                });
                historyData.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
                setHistory(historyData);
            }, (error) => {
                setError(`Failed to load history: ${error.message}`);
            });

            firestoreHistoryUnsubscribeRef.current = unsubscribeHistory;

            return () => {
                if (unsubscribeHistory) {
                    unsubscribeHistory();
                }
            };
        }
    }, [authReady, firestoreDb, firebaseAuth, currentAppId]);

    const getActualUserId = () => {
        return firebaseAuth?.currentUser?.uid || 'anonymous_user';
    };

    const addTranslationHistory = async (data) => {
        if (!firestoreDb || !firebaseAuth?.currentUser) return;
        const collectionPath = `artifacts/${currentAppId}/users/${getActualUserId()}/translations`;
        try {
            await addDoc(collection(firestoreDb, collectionPath), { ...data, timestamp: serverTimestamp() });
        } catch (e) {
            console.error("Error adding document to Firestore:", e);
        }
    };
    
    const updateTranslationHistory = async (id, updatedFields) => {
        if (!firestoreDb || !firebaseAuth?.currentUser) return;
        const collectionPath = `artifacts/${currentAppId}/users/${getActualUserId()}/translations`;
        const docRef = doc(firestoreDb, collectionPath, id);
        try {
            await updateDoc(docRef, updatedFields);
        } catch (e) {
            console.error("Error updating document: ", e);
        }
    };

    const handleImageUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            stopCamera();
            setExtractedText('');
            setTranslatedText('');
            setContextualInfo('');
            setOverlayedImage(null);
            setError(''); 
            const reader = new FileReader();
            reader.onloadend = () => setSelectedImage(reader.result.split(',')[1]);
            reader.readAsDataURL(file);
        }
    };
    
    const handleClearImage = () => {
        setSelectedImage(null);
        setExtractedText('');
        setTranslatedText('');
        setContextualInfo('');
        setOverlayedImage(null);
        setError('');
        const fileInput = document.getElementById('image-upload');
        if (fileInput) fileInput.value = '';
        stopCamera();
    };
    
    const openCamera = async () => {
        setSelectedImage(null);
        setExtractedText('');
        setTranslatedText('');
        setContextualInfo('');
        setOverlayedImage(null);
        setError('');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
                setIsCameraActive(true);
                mediaStreamRef.current = stream;
            }
        } catch (err) {
            setError(`Failed to access camera. Error: ${err.message}`);
            setIsCameraActive(false);
        }
    };
    
    const stopCamera = () => {
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }
        setIsCameraActive(false);
    };
    
    const captureImage = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d');
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = canvas.toDataURL('image/jpeg', 0.9);
            setSelectedImage(imageData.split(',')[1]);
            stopCamera();
        }
    };

    const handleSpeak = (textToSpeak) => {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            const langMap = {'Chinese (Simplified)': 'zh-CN', 'Japanese': 'ja-JP', 'Korean': 'ko-KR', 'Arabic': 'ar-SA', 'Russian': 'ru-RU', 'Hindi': 'hi-IN', 'Spanish': 'es-ES', 'French': 'fr-FR', 'German': 'de-DE', 'Italian': 'it-IT', 'Portuguese': 'pt-PT'};
            utterance.lang = langMap[targetLanguage] || 'en-US';
            window.speechSynthesis.speak(utterance);
        } else {
            setError("Text-to-speech not supported.");
        }
    };

    const handleCopyTranslatedText = (textToCopy) => {
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            alert('Translated text copied!');
        } catch (err) {
            setError('Failed to copy text.');
        } finally {
            document.body.removeChild(textarea);
        }
    };

    const toggleFavorite = (id, currentStatus) => {
        updateTranslationHistory(id, { isFavorite: !currentStatus });
    };

    const openNoteModal = (id, existingNote) => {
        setCurrentHistoryItemId(id);
        setCurrentNote(existingNote || '');
        setIsNoteModalOpen(true);
    };

    const saveNote = () => {
        if (currentHistoryItemId) {
            updateTranslationHistory(currentHistoryItemId, { notes: currentNote });
            setIsNoteModalOpen(false);
        }
    };

    const drawTextOnImage = (img, text) => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0, img.width, img.height);
        ctx.font = `${Math.max(16, img.height / 20)}px Inter, sans-serif`;
        ctx.fillStyle = '#FFD700';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const lines = text.split('\n');
        const lineHeight = parseInt(ctx.font) * 1.2;
        let y = img.height - 10;
        for (let i = lines.length - 1; i >= 0; i--) {
            ctx.strokeText(lines[i], img.width / 2, y);
            ctx.fillText(lines[i], img.width / 2, y);
            y -= lineHeight;
        }
        return tempCanvas.toDataURL('image/jpeg', 0.9);
    };

    const handleTranslate = async () => {
        if (!selectedImage) {
            setError('Please upload or capture an image first.');
            return;
        }
        setIsLoading(true);
        setError('');
        setExtractedText('');
        setTranslatedText('');
        setContextualInfo('');
        setOverlayedImage(null);

        try {
            const apiKey = firebaseConfig.apiKey;
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

            const visionPrompt = "Extract all visible text from this image. If there are multiple distinct blocks of text, please list them individually.";
            const visionPayload = {
                contents: [{ role: "user", parts: [{ text: visionPrompt }, { inlineData: { mimeType: "image/jpeg", data: selectedImage } }] }]
            };
            const visionResponse = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(visionPayload) });
            if (!visionResponse.ok) {
                 const errorData = await visionResponse.json();
                 throw new Error(`Text extraction failed: ${errorData.error?.message || 'Check API key and billing.'}`);
            }
            const visionResult = await visionResponse.json();
            const extracted = visionResult.candidates?.[0]?.content?.parts?.[0]?.text.trim() || 'No text extracted.';
            setExtractedText(extracted);

            if (extracted === 'No text extracted.' || extracted.length < 2) {
                 setIsLoading(false);
                 return;
            }

            const translationPrompt = `Translate the following text into ${targetLanguage}: "${extracted}"`;
            const translationPayload = { contents: [{ role: "user", parts: [{ text: translationPrompt }] }] };
            const translationResponse = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(translationPayload) });
            if (!translationResponse.ok) throw new Error('Translation failed');
            const translationResult = await translationResponse.json();
            const translated = translationResult.candidates?.[0]?.content?.parts?.[0]?.text.trim() || 'Translation failed.';
            setTranslatedText(translated);

            const contextPrompt = `Provide brief cultural context for the text: "${extracted}". Keep it concise.`;
            const contextPayload = { contents: [{ role: "user", parts: [{ text: contextPrompt }] }] };
            const contextResponse = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contextPayload) });
            const contextResult = contextResponse.ok ? await contextResponse.json() : null;
            const context = contextResult?.candidates?.[0]?.content?.parts?.[0]?.text.trim() || 'No context available.';
            setContextualInfo(context);

            const img = new Image();
            img.src = `data:image/jpeg;base64,${selectedImage}`;
            img.onload = () => {
                const overlaidDataUrl = drawTextOnImage(img, translated);
                setOverlayedImage(overlaidDataUrl);
                const thumbCanvas = document.createElement('canvas');
                const scale = 100 / img.width;
                thumbCanvas.width = 100;
                thumbCanvas.height = img.height * scale;
                const thumbCtx = thumbCanvas.getContext('2d');
                thumbCtx.drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);
                const thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.7).split(',')[1];
                addTranslationHistory({ originalImageThumbnail: thumbnail, originalText: extracted, translatedText: translated, contextualInfo: context, targetLanguage, isFavorite: false, notes: '' });
            };
            img.onerror = () => {
                addTranslationHistory({ originalText: extracted, translatedText: translated, contextualInfo: context, targetLanguage, isFavorite: false, notes: '' });
            };

        } catch (err) {
            console.error("Caught an error during translation:", err); 
            setError(`An error occurred. Check the browser console (Right-click -> Inspect -> Console) for details.`);
        } finally {
            setIsLoading(false);
        }
    };
    
    if (!authReady) {
        return (
            <div className="app-container">
                <p>Initializing Secure Connection...</p>
            </div>
        );
    }
    
    return (
        <div className="app-container">
             <div className="main-card">
                <header className="header">
                    <h1 className="title">Signboard Translator</h1>
                    <p className="subtitle">Translate text from images with a single click.</p>
                </header>
                
                <div className="grid-container">
                    {/* Left Column */}
                    <div className="column">
                        <div className="step-card">
                            <h2 className="step-title"><span className="step-number">1</span> Choose Image Source</h2>
                            {isCameraActive ? (
                                <div>
                                    <video ref={videoRef} style={{ width: '100%', borderRadius: '8px', marginBottom: '1rem' }} autoPlay playsInline></video>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <button onClick={captureImage} className="button">Capture</button>
                                        <button onClick={stopCamera} className="button" style={{ backgroundColor: '#718096'}}>Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                    <label htmlFor="image-upload" className="upload-box">
                                        <span className="upload-box-text">Upload a file</span> or drag and drop
                                    </label>
                                    <input type="file" id="image-upload" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                                    <p style={{color: '#a0aec0'}}>- OR -</p>
                                    <button onClick={openCamera} className="button">
                                        <Icon path="M10 12a2 2 0 100-4 2 2 0 000 4z M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" />
                                        Use Camera
                                    </button>
                                </div>
                            )}
                             <canvas ref={canvasRef} style={{display: 'none'}}></canvas>
                        </div>

                        <div className="step-card">
                            <h2 className="step-title"><span className="step-number">2</span> Select Language</h2>
                            <select id="target-language" value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value)} className="select-input">
                                {languages.map((lang) => <option key={lang} value={lang}>{lang}</option>)}
                            </select>
                        </div>

                        <div className="step-card">
                            <h2 className="step-title"><span className="step-number">3</span> Get Translation</h2>
                            <button onClick={handleTranslate} disabled={isLoading || !selectedImage} className="button button-translate">
                                {isLoading ? 'Translating...' : 'Translate Signboard Text'}
                            </button>
                        </div>
                    </div>

                    {/* Right Column */}
                     <div className="column">
                        <div className="image-display-box">
                            {selectedImage ? (
                                <>
                                    <img src={overlayedImage || `data:image/jpeg;base64,${selectedImage}`} alt="Source for translation" className="image-element" />
                                    <button onClick={handleClearImage} className="clear-button" title="Clear Image">
                                        <Icon path="M6 18L18 6M6 6l12 12" className="w-4 h-4" style={{color: '#4a5568'}}/>
                                    </button>
                                </>
                            ) : (
                               <div style={{ textAlign: 'center', color: '#a0aec0' }}>
                                   <Icon path="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6l2-2m-2 2l-2-2m0 0l-2 2m2-2l2 2" className="w-16 h-16 mx-auto mb-4"/>
                                   <p>Your image will appear here</p>
                               </div>
                            )}
                        </div>
                        
                        {(extractedText || translatedText || error) && (
                            <div className="step-card results-card">
                                {error && <div style={{backgroundColor: '#fed7d7', border: '1px solid #f56565', color: '#c53030', padding: '1rem', borderRadius: '8px', marginBottom: '1rem'}}>{error}</div>}
                                
                                {extractedText && <div style={{marginBottom: '1rem'}}>
                                    <h3 className="results-heading">Extracted Text</h3>
                                    <p className="results-text-box">{extractedText}</p>
                                </div>}
                                
                                {translatedText && <div style={{marginBottom: '1rem'}}>
                                    <h3 className="results-heading">Translated Text ({targetLanguage})</h3>
                                    <div className="results-text-box translated">
                                        <span>{translatedText}</span>
                                        <div className="action-buttons" style={{display: 'flex', gap: '0.5rem'}}>
                                            <button onClick={() => handleSpeak(translatedText)} title="Speak"><Icon path="M4.055 6.257A1 1 0 003 7.172v5.656a1 1 0 001.055.915 8.001 8.001 0 010-7.488zM5 6.5A1.5 1.5 0 016.5 5h1A1.5 1.5 0 019 6.5v7a1.5 1.5 0 01-1.5 1.5h-1A1.5 1.5 0 015 13.5v-7zm6.5-1.5a.5.5 0 000 1h1a.5.5 0 000-1h-1zm0 2a.5.5 0 000 1h3a.5.5 0 000-1h-3zm0 2a.5.5 0 000 1h3a.5.5 0 000-1h-3zm0 2a.5.5 0 000 1h1a.5.5 0 000-1h-1z"/></button>
                                            <button onClick={() => handleCopyTranslatedText(translatedText)} title="Copy"><Icon path="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9zM4 3a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H4z"/></button>
                                        </div>
                                    </div>
                                </div>}

                                {contextualInfo && <div>
                                    <h3 className="results-heading">Contextual Info</h3>
                                    <p className="results-text-box translated">{contextualInfo}</p>
                                </div>}
                            </div>
                        )}
                    </div>
                </div>
                
                 <div className="history-container">
                    <h2 className="step-title">Translation History</h2>
                    <div className="history-list">
                        {history.length > 0 ? history.map((entry) => (
                            <div key={entry.id} className={`history-item ${entry.isFavorite ? 'favorite' : ''}`}>
                                <img src={`data:image/jpeg;base64,${entry.originalImageThumbnail}`} alt="Thumbnail" className="history-thumbnail" />
                                <div style={{flexGrow: 1}}>
                                    <p style={{fontFamily: 'monospace', fontSize: '0.9rem'}}><strong>Original:</strong> {entry.originalText}</p>
                                    <p style={{fontSize: '0.9rem'}}><strong>Translated:</strong> {entry.translatedText}</p>
                                    {entry.notes && <p style={{fontSize: '0.8rem', fontStyle: 'italic', marginTop: '0.25rem', color: '#718096'}}><strong>Note:</strong> {entry.notes}</p>}
                                </div>
                                <div className="history-actions" style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                                    <button onClick={() => toggleFavorite(entry.id, entry.isFavorite)} className={`favorite-btn ${entry.isFavorite ? 'active' : ''}`} title="Favorite"><Icon path="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.28 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" className="w-4 h-4" /></button>
                                    <button onClick={() => openNoteModal(entry.id, entry.notes)} title="Add/Edit Note"><Icon path="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828zM5 17a1 1 0 01-1-1v-6a1 1 0 112 0v6a1 1 0 01-1 1z" className="w-4 h-4" /></button>
                                </div>
                            </div>
                        )) : <p style={{color: '#a0aec0', fontStyle: 'italic', textAlign: 'center', padding: '1rem'}}>No history yet.</p>}
                    </div>
                </div>
             </div>

             {isNoteModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3 style={{fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem'}}>Add/Edit Note</h3>
                        <textarea style={{width: '100%', minHeight: '120px', padding: '0.75rem', border: '1px solid #cbd5e0', borderRadius: '8px'}} value={currentNote} onChange={(e) => setCurrentNote(e.target.value)} placeholder="Type your note here..."></textarea>
                        <div style={{display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem'}}>
                            <button onClick={() => setIsNoteModalOpen(false)} className="button" style={{width: 'auto', backgroundColor: '#a0aec0'}}>Cancel</button>
                            <button onClick={saveNote} className="button" style={{width: 'auto'}}>Save Note</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;