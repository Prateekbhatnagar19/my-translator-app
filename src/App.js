import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, addDoc, query, onSnapshot, serverTimestamp, doc, updateDoc } from "firebase/firestore";

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
                console.log("Firebase initialized.");

                onAuthStateChanged(authInstance, async (user) => {
                    if (!user) {
                        try {
                            await signInAnonymously(authInstance);
                            console.log("Signed in anonymously.");
                        } catch (authError) {
                            console.error("Firebase Auth Error:", authError);
                            setError(`Authentication failed: ${authError.message}`);
                        }
                    } else {
                        console.log("User authenticated:", user.uid);
                        setAuthReady(true);
                    }
                });

            } catch (err) {
                console.error("Failed to initialize Firebase:", err);
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
            console.log("Setting up history listener for user:", firebaseAuth.currentUser.uid);
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
                console.error("Error listening to translation history:", error);
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
            // --- THIS IS THE ONLY CHANGE IN THIS ENTIRE FILE ---
            // Log the entire error object to the console for detailed debugging
            console.error("Caught an error during translation:", err); 
            // Update the UI with a more generic message, asking the user to check the console
            setError(`An error occurred. Check the browser console (Right-click -> Inspect -> Console) for details.`);
        } finally {
            setIsLoading(false);
        }
    };
    
    // The JSX (HTML part) is unchanged
    if (!authReady) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 text-gray-700">
                <svg className="animate-spin h-8 w-8 mr-3 text-blue-600" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Initializing Secure Connection...
            </div>
        );
    }
    
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-700 via-blue-800 to-blue-900 flex items-center justify-center p-4 font-sans text-white overflow-auto">
             <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-2xl w-full max-w-sm md:max-w-xl lg:max-w-3xl xl:max-w-4xl border border-blue-500">
                <header className="text-center mb-6 sm:mb-8">
                    <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-2 tracking-tight">
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-400 via-cyan-400 to-blue-500 animate-pulse">
                            Multilingual Image Text Translator
                        </span>
                    </h1>
                </header>
                <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 sm:p-6 rounded-2xl border border-blue-300 shadow-xl">
                    <h2 className="block text-lg sm:text-xl font-bold text-gray-800 mb-4">1. Choose Image Source</h2>
                    {isCameraActive ? (
                        <div className="flex flex-col items-center space-y-4">
                            <video ref={videoRef} className="w-full max-h-80 object-cover rounded-lg shadow-md" autoPlay playsInline></video>
                            <div className="flex space-x-4">
                                <button onClick={captureImage} className="px-5 py-2 bg-green-500 text-white font-semibold rounded-full shadow-md hover:bg-green-600">Click Image</button>
                                <button onClick={stopCamera} className="px-5 py-2 bg-gray-500 text-white font-semibold rounded-full shadow-md hover:bg-gray-600">Close Camera</button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center space-y-4">
                            <input type="file" id="image-upload" accept="image/*" onChange={handleImageUpload} className="w-full p-2 border rounded" />
                            <p className="text-gray-600">- OR -</p>
                            <button onClick={openCamera} className="px-6 py-2 bg-blue-500 text-white font-semibold rounded-full shadow-md hover:bg-blue-600">Open Camera</button>
                        </div>
                    )}
                    <canvas ref={canvasRef} className="hidden"></canvas>
                    {selectedImage && (
                        <div className="mt-4 flex flex-col items-center">
                            <img src={overlayedImage || `data:image/jpeg;base64,${selectedImage}`} alt="Source" className="max-w-full h-48 object-contain rounded-lg shadow-xl" />
                            <button onClick={handleClearImage} className="mt-3 px-5 py-2 bg-red-600 text-white font-semibold rounded-full shadow-lg hover:bg-red-700">Clear Image</button>
                        </div>
                    )}
                </div>
                <div className="mb-6 bg-gradient-to-r from-purple-100 to-pink-100 p-4 sm:p-6 rounded-2xl border border-purple-300 shadow-xl">
                    <label htmlFor="target-language" className="block text-lg sm:text-xl font-bold text-gray-800 mb-3">2. Select Target Language</label>
                    <select id="target-language" value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value)} className="w-full p-2 border rounded text-gray-800">
                        {languages.map((lang) => <option key={lang} value={lang}>{lang}</option>)}
                    </select>
                </div>
                <div className="mb-6 text-center">
                    <button onClick={handleTranslate} disabled={isLoading || !selectedImage} className="w-full md:w-auto px-8 py-3 bg-green-500 text-white font-bold rounded-full shadow-lg hover:bg-green-600 disabled:opacity-50">
                        {isLoading ? 'Translating...' : '3. Translate Signboard Text'}
                    </button>
                </div>
                {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-6">{error}</div>}
                {(extractedText || translatedText) && !isLoading && (
                    <div className="bg-gray-100 p-4 rounded-lg shadow-inner text-gray-800">
                        <div className="mb-4">
                            <h2 className="text-xl font-bold mb-2">Extracted Text:</h2>
                            <div className="bg-white p-3 rounded min-h-[80px]">{extractedText}</div>
                        </div>
                        <div className="mb-4">
                            <h2 className="text-xl font-bold mb-2">Translated Text ({targetLanguage}):</h2>
                            <div className="bg-white p-3 rounded min-h-[80px] flex justify-between items-center">
                                <span>{translatedText}</span>
                                {translatedText && (
                                    <div className="flex space-x-2">
                                        <button onClick={() => handleSpeak(translatedText)} title="Speak"><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M7 3a1 1 0 000 2v10a1 1 0 100-2V5h1v10a1 1 0 102 0V5a1 1 0 10-2 0V3a1 1 0 00-1-1zm4 0a1 1 0 10-2 0v10a1 1 0 102 0V3z"></path></svg></button>
                                        <button onClick={() => handleCopyTranslatedText(translatedText)} title="Copy"><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"></path><path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h4a2 2 0 002-2V5a2 2 0 00-2-2H6z"></path></svg></button>
                                    </div>
                                )}
                            </div>
                        </div>
                        {contextualInfo && <div><h2 className="text-xl font-bold mb-2">Contextual Info:</h2><div className="bg-white p-3 rounded min-h-[80px]">{contextualInfo}</div></div>}
                    </div>
                )}
                <div className="mt-8 bg-gray-50 p-4 rounded-xl shadow-lg">
                    <h2 className="text-xl font-bold text-gray-800 mb-4">Translation History</h2>
                    <div className="max-h-60 overflow-y-auto">
                        {history.length > 0 ? history.map((entry) => (
                            <div key={entry.id} className={`p-3 mb-2 rounded-lg bg-white shadow flex items-center ${entry.isFavorite ? 'border-2 border-yellow-400' : ''}`}>
                                <img src={`data:image/jpeg;base64,${entry.originalImageThumbnail}`} alt="Thumb" className="w-16 h-16 object-cover rounded mr-4" />
                                <div className="flex-grow text-sm text-gray-700">
                                    <p><strong>Original:</strong> {entry.originalText}</p>
                                    <p><strong>Translated:</strong> {entry.translatedText}</p>
                                    {entry.notes && <p className="text-xs italic mt-1"><strong>Note:</strong> {entry.notes}</p>}
                                </div>
                                <div className="flex flex-col space-y-1 ml-2">
                                    <button onClick={() => toggleFavorite(entry.id, entry.isFavorite)} className={`p-1 rounded-full ${entry.isFavorite ? 'bg-yellow-400' : 'bg-gray-200'}`} title="Favorite"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.28 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg></button>
                                    <button onClick={() => openNoteModal(entry.id, entry.notes)} className="p-1 rounded-full bg-blue-200" title="Add Note"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828zM3 17a1 1 0 01-1-1V4a1 1 0 112 0v12a1 1 0 01-1 1z"></path></svg></button>
                                </div>
                            </div>
                        )) : <p className="text-gray-500 italic text-center">No history yet.</p>}
                    </div>
                </div>
             </div>
             {isNoteModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
                        <h3 className="text-xl font-bold text-gray-800 mb-4">Add/Edit Note</h3>
                        <textarea className="w-full p-2 border rounded text-gray-800" value={currentNote} onChange={(e) => setCurrentNote(e.target.value)} rows="4"></textarea>
                        <div className="flex justify-end space-x-2 mt-4">
                            <button onClick={() => setIsNoteModalOpen(false)} className="px-4 py-2 bg-gray-300 rounded">Cancel</button>
                            <button onClick={saveNote} className="px-4 py-2 bg-blue-600 text-white rounded">Save Note</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;