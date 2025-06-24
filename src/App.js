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
            console.error("Caught an error during translation:", err); 
            setError(`An error occurred. Check the browser console (Right-click -> Inspect -> Console) for details.`);
        } finally {
            setIsLoading(false);
        }
    };
    
    if (!authReady) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-900 text-gray-300 font-sans">
                <svg className="animate-spin h-8 w-8 mr-3 text-blue-500" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Initializing Secure Connection...
            </div>
        );
    }
    
    // --- UI Revamped with Tailwind CSS for a Modern Look ---
    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 sm:p-6 font-sans">
             <div className="bg-gray-800 bg-opacity-60 backdrop-blur-lg p-6 sm:p-8 rounded-3xl shadow-2xl w-full max-w-4xl border border-gray-700">
                
                {/* Header */}
                <header className="text-center mb-8">
                    <h1 className="text-4xl sm:text-5xl font-extrabold mb-2 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-teal-300">
                        Signboard Translator
                    </h1>
                    <p className="text-gray-400 text-lg">Translate text from images with a single click.</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Left Column: Input and Controls */}
                    <div className="flex flex-col space-y-6">
                        {/* Step 1: Image Source */}
                        <div className="bg-gray-700/50 p-6 rounded-2xl border border-gray-600">
                            <h2 className="text-xl font-bold text-gray-200 mb-4 flex items-center">
                                <span className="bg-blue-500 text-white rounded-full h-8 w-8 flex items-center justify-center mr-3 font-bold text-lg">1</span>
                                Choose Image Source
                            </h2>
                            {isCameraActive ? (
                                <div className="flex flex-col items-center space-y-4">
                                    <video ref={videoRef} className="w-full h-auto max-h-72 object-cover rounded-lg shadow-lg border-2 border-gray-600" autoPlay playsInline></video>
                                    <div className="flex w-full space-x-4">
                                        <button onClick={captureImage} className="w-full py-3 bg-gradient-to-r from-green-500 to-green-600 text-white font-bold rounded-lg shadow-md hover:scale-105 transition-transform duration-200 flex items-center justify-center">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2H4zm10 5a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>
                                            Capture
                                        </button>
                                        <button onClick={stopCamera} className="w-full py-3 bg-gradient-to-r from-gray-600 to-gray-700 text-white font-bold rounded-lg shadow-md hover:scale-105 transition-transform duration-200">Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center space-y-4">
                                    <label htmlFor="image-upload" className="w-full text-center py-4 px-6 border-2 border-dashed border-gray-500 rounded-lg cursor-pointer hover:bg-gray-700 hover:border-gray-400 transition-colors duration-200">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto mb-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                        <span className="text-blue-400 font-semibold">Upload a file</span>
                                        <span className="text-gray-400"> or drag and drop</span>
                                    </label>
                                    <input type="file" id="image-upload" accept="image/*" onChange={handleImageUpload} className="hidden" />
                                    <p className="text-gray-500">- OR -</p>
                                    <button onClick={openCamera} className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold rounded-lg shadow-md hover:scale-105 transition-transform duration-200 flex items-center justify-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>
                                        Use Camera
                                    </button>
                                </div>
                            )}
                            <canvas ref={canvasRef} className="hidden"></canvas>
                        </div>

                        {/* Step 2: Language Selection */}
                         <div className="bg-gray-700/50 p-6 rounded-2xl border border-gray-600">
                            <h2 className="text-xl font-bold text-gray-200 mb-4 flex items-center">
                                <span className="bg-blue-500 text-white rounded-full h-8 w-8 flex items-center justify-center mr-3 font-bold text-lg">2</span>
                                Select Language
                            </h2>
                            <select id="target-language" value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value)} className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
                                {languages.map((lang) => <option key={lang} value={lang}>{lang}</option>)}
                            </select>
                        </div>
                        
                        {/* Step 3: Translate Button */}
                         <div className="bg-gray-700/50 p-6 rounded-2xl border border-gray-600">
                             <h2 className="text-xl font-bold text-gray-200 mb-4 flex items-center">
                                <span className="bg-blue-500 text-white rounded-full h-8 w-8 flex items-center justify-center mr-3 font-bold text-lg">3</span>
                                Get Translation
                            </h2>
                            <button onClick={handleTranslate} disabled={isLoading || !selectedImage} className="w-full py-4 bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-extrabold text-lg rounded-lg shadow-lg hover:scale-105 transition-transform duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100 flex items-center justify-center">
                                {isLoading ? (
                                    <>
                                        <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                        Translating...
                                    </>
                                ) : 'Translate Signboard Text'}
                            </button>
                        </div>
                    </div>

                    {/* Right Column: Image and Results */}
                    <div className="flex flex-col space-y-6">
                        {/* Image Display */}
                        <div className="bg-gray-700/50 p-6 rounded-2xl border border-gray-600 min-h-[300px] flex flex-col justify-center items-center">
                             {selectedImage ? (
                                <div className="w-full relative">
                                    <img src={overlayedImage || `data:image/jpeg;base64,${selectedImage}`} alt="Source for translation" className="w-full h-auto max-h-64 object-contain rounded-lg shadow-2xl" />
                                    <button onClick={handleClearImage} className="absolute -top-3 -right-3 bg-red-600 text-white rounded-full h-8 w-8 flex items-center justify-center shadow-lg hover:bg-red-700 hover:scale-110 transition-transform">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                            ) : (
                               <div className="text-center text-gray-500">
                                   <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6l2-2m-2 2l-2-2m0 0l-2 2m2-2l2 2" /></svg>
                                   <p>Your image will appear here</p>
                               </div>
                            )}
                        </div>
                        
                        {/* Results Area */}
                        {(extractedText || translatedText || error) && (
                            <div className="bg-gray-700/50 p-6 rounded-2xl border border-gray-600 flex-grow">
                                {error && <div className="bg-red-500/30 border border-red-500 text-red-300 px-4 py-3 rounded-lg mb-4">{error}</div>}
                                
                                {extractedText && <div className="mb-4">
                                    <h3 className="text-lg font-bold text-gray-300 mb-2">Extracted Text</h3>
                                    <p className="bg-gray-900/70 p-3 rounded-lg text-gray-300 font-mono text-sm whitespace-pre-wrap">{extractedText}</p>
                                </div>}
                                
                                {translatedText && <div className="mb-4">
                                    <h3 className="text-lg font-bold text-gray-300 mb-2">Translated Text ({targetLanguage})</h3>
                                    <div className="bg-gray-900/70 p-3 rounded-lg text-gray-200 text-sm whitespace-pre-wrap flex justify-between items-start">
                                        <span>{translatedText}</span>
                                        <div className="flex space-x-2">
                                            <button onClick={() => handleSpeak(translatedText)} title="Speak" className="text-gray-400 hover:text-white"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M4.055 6.257A1 1 0 003 7.172v5.656a1 1 0 001.055.915 8.001 8.001 0 010-7.488z" /><path fillRule="evenodd" d="M5 6.5A1.5 1.5 0 016.5 5h1A1.5 1.5 0 019 6.5v7a1.5 1.5 0 01-1.5 1.5h-1A1.5 1.5 0 015 13.5v-7zm6.5-1.5a.5.5 0 000 1h1a.5.5 0 000-1h-1zm0 2a.5.5 0 000 1h3a.5.5 0 000-1h-3zm0 2a.5.5 0 000 1h3a.5.5 0 000-1h-3zm0 2a.5.5 0 000 1h1a.5.5 0 000-1h-1z" clipRule="evenodd" /></svg></button>
                                            <button onClick={() => handleCopyTranslatedText(translatedText)} title="Copy" className="text-gray-400 hover:text-white"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" /><path d="M4 3a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H4z" /></svg></button>
                                        </div>
                                    </div>
                                </div>}

                                {contextualInfo && <div>
                                    <h3 className="text-lg font-bold text-gray-300 mb-2">Contextual Info</h3>
                                    <p className="bg-gray-900/70 p-3 rounded-lg text-gray-300 text-sm whitespace-pre-wrap">{contextualInfo}</p>
                                </div>}
                            </div>
                        )}
                    </div>
                </div>
                
                 {/* Translation History Section */}
                <div className="mt-8 bg-gray-700/50 p-6 rounded-2xl border border-gray-600">
                    <h2 className="text-xl font-bold text-gray-200 mb-4">Translation History</h2>
                    <div className="max-h-64 overflow-y-auto pr-2">
                        {history.length > 0 ? history.map((entry) => (
                            <div key={entry.id} className={`p-4 mb-3 rounded-xl bg-gray-800/60 shadow-lg flex items-center space-x-4 transition-all duration-200 ${entry.isFavorite ? 'ring-2 ring-yellow-500' : 'border border-gray-700'}`}>
                                <img src={`data:image/jpeg;base64,${entry.originalImageThumbnail}`} alt="Thumbnail" className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
                                <div className="flex-grow text-sm text-gray-300">
                                    <p className="font-mono"><strong className="font-sans font-semibold text-gray-400">Original:</strong> {entry.originalText}</p>
                                    <p><strong className="font-semibold text-gray-400">Translated:</strong> {entry.translatedText}</p>
                                    {entry.notes && <p className="text-xs italic mt-1 text-gray-400"><strong>Note:</strong> {entry.notes}</p>}
                                </div>
                                <div className="flex flex-col space-y-2">
                                    <button onClick={() => toggleFavorite(entry.id, entry.isFavorite)} className={`p-2 rounded-full transition-colors ${entry.isFavorite ? 'bg-yellow-500 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`} title={entry.isFavorite ? "Unfavorite" : "Favorite"}>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.28 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                                    </button>
                                    <button onClick={() => openNoteModal(entry.id, entry.notes)} className="p-2 rounded-full bg-gray-700 text-gray-400 hover:bg-gray-600" title="Add/Edit Note">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828zM5 17a1 1 0 01-1-1v-6a1 1 0 112 0v6a1 1 0 01-1 1z" /></svg>
                                    </button>
                                </div>
                            </div>
                        )) : <p className="text-gray-500 italic text-center py-4">No history yet.</p>}
                    </div>
                </div>
             </div>

             {/* Note Modal */}
             {isNoteModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-gray-800 p-6 rounded-2xl shadow-xl w-full max-w-md border border-gray-700">
                        <h3 className="text-xl font-bold text-white mb-4">Add/Edit Note</h3>
                        <textarea className="w-full p-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[120px]" value={currentNote} onChange={(e) => setCurrentNote(e.target.value)} placeholder="Type your note here..."></textarea>
                        <div className="flex justify-end space-x-3 mt-4">
                            <button onClick={() => setIsNoteModalOpen(false)} className="px-5 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors">Cancel</button>
                            <button onClick={saveNote} className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors">Save Note</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;