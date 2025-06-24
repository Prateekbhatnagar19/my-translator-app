import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, addDoc, query, onSnapshot, serverTimestamp, doc, updateDoc } from "firebase/firestore";

// --- Helper component for icons ---
const Icon = ({ path, className = "w-5 h-5", style = {} }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor" style={style}>
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
        document.body.style.fontFamily = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
        document.body.style.backgroundColor = '#f0f2f5';
        document.body.style.margin = '0';

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
                 console.error("Vision API Error Response:", errorData);
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
    
    // --- Styles Object for a Guaranteed Professional Look ---
    const styles = {
        appContainer: {
            padding: '2rem',
            color: '#333'
        },
        mainCard: {
            backgroundColor: '#ffffff',
            borderRadius: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            padding: '2.5rem',
            maxWidth: '1200px',
            margin: 'auto',
            border: '1px solid #e2e8f0'
        },
        header: {
            textAlign: 'center',
            marginBottom: '2.5rem',
        },
        title: {
            fontSize: '2.5rem',
            fontWeight: '800',
            color: '#1a202c',
            letterSpacing: '-0.025em'
        },
        subtitle: {
            fontSize: '1.1rem',
            color: '#718096',
            marginTop: '0.5rem',
            maxWidth: '600px',
            margin: '0.5rem auto 0 auto'
        },
        gridContainer: {
            display: 'grid',
            gridTemplateColumns: '1fr', // Single column by default
            gap: '2rem',
        },
        // Media query for larger screens will be handled in a style tag for simplicity
        column: {
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
        },
        stepCard: {
            backgroundColor: '#f8fafc',
            padding: '1.5rem',
            borderRadius: '16px',
            border: '1px solid #e8edf3',
        },
        stepTitle: {
            fontSize: '1.25rem',
            fontWeight: '700',
            color: '#334155',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
        },
        stepNumber: {
            backgroundColor: '#3b82f6',
            color: 'white',
            borderRadius: '50%',
            width: '2rem',
            height: '2rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: '0.75rem',
            fontWeight: 'bold',
            flexShrink: 0
        },
        uploadBox: {
            textAlign: 'center',
            padding: '2rem',
            border: '2px dashed #cbd5e0',
            borderRadius: '12px',
            cursor: 'pointer',
            backgroundColor: '#ffffff',
            transition: 'background-color 0.2s, border-color 0.2s',
        },
        button: {
            width: '100%',
            padding: '0.8rem 1rem',
            backgroundImage: 'linear-gradient(to right, #3b82f6, #2563eb)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: '600',
            fontSize: '1rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 4px 14px 0 rgba(0, 118, 255, 0.39)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
        },
        buttonTranslate: {
            backgroundImage: 'linear-gradient(to right, #10b981, #059669)',
            paddingTop: '1rem',
            paddingBottom: '1rem',
            fontSize: '1.1rem',
            boxShadow: '0 4px 14px 0 rgba(16, 185, 129, 0.39)',
        },
        selectInput: {
            width: '100%',
            padding: '0.8rem',
            border: '1px solid #cbd5e0',
            borderRadius: '8px',
            backgroundColor: 'white',
            fontSize: '1rem',
        },
        imageDisplayBox: {
            minHeight: '300px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: '#f8fafc',
            borderRadius: '16px',
            padding: '1rem',
            position: 'relative',
            border: '1px solid #e8edf3',
        },
        imageElement: {
            maxWidth: '100%',
            maxHeight: '280px',
            objectFit: 'contain',
            borderRadius: '8px',
        },
        clearButton: {
            position: 'absolute',
            top: '0.75rem',
            right: '0.75rem',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            border: '1px solid #e2e8f0',
            borderRadius: '50%',
            width: '2rem',
            height: '2rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            cursor: 'pointer',
        },
        resultsCard: {
            backgroundColor: 'white',
            padding: '1.5rem',
            borderRadius: '16px',
            border: '1px solid #e8edf3',
        },
        resultsHeading: {
            fontWeight: 600,
            marginBottom: '0.5rem',
            color: '#4a5568',
        },
        resultsTextBox: {
            backgroundColor: '#f8fafc',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            fontFamily: `'Fira Code', 'Courier New', monospace`,
            whiteSpace: 'pre-wrap',
            color: '#1e293b',
            border: '1px solid #e8edf3',
        },
        translatedTextBox: {
            fontFamily: `'Segoe UI', sans-serif`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'start',
            gap: '1rem',
        },
        actionButtons: {
             display: 'flex',
             gap: '0.5rem',
             flexShrink: 0,
        },
        historyContainer: {
            marginTop: '2.5rem',
            padding: '1.5rem',
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
        },
        historyList: {
            maxHeight: '400px',
            overflowY: 'auto',
            paddingRight: '0.5rem',
        },
        historyItem: {
            backgroundColor: '#f8fafc',
            padding: '1rem',
            marginBottom: '0.75rem',
            borderRadius: '12px',
            border: '1px solid #e8edf3',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
        },
        historyThumbnail: {
            width: '4rem',
            height: '4rem',
            objectFit: 'cover',
            borderRadius: '8px',
            flexShrink: 0,
        },
        modalOverlay: {
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
        },
        modalContent: {
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '500px',
        },
    };
    
    if (!authReady) {
        return (
            <div style={styles.appContainer}>
                <div style={{textAlign: 'center'}}>Initializing Secure Connection...</div>
            </div>
        );
    }
    
    return (
        <div style={styles.appContainer}>
             {/* Style tag for responsive grid layout */}
             <style>{`
                @media (min-width: 768px) {
                    .grid-container {
                        grid-template-columns: repeat(2, 1fr);
                    }
                }
             `}</style>
             <div style={styles.mainCard}>
                <header style={styles.header}>
                    <h1 style={styles.title}>Multilingual Image Text Translator Web App</h1>
                    <p style={styles.subtitle}>Translate Text from Images, Posters, and Banners with an Image Upload</p>
                </header>
                
                <div className="grid-container" style={styles.gridContainer}>
                    {/* Left Column */}
                    <div style={styles.column}>
                        <div style={styles.stepCard}>
                            <h2 style={styles.stepTitle}><span style={styles.stepNumber}>1</span> Choose Image Source</h2>
                            {isCameraActive ? (
                                <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                                    <video ref={videoRef} style={{ width: '100%', borderRadius: '8px' }} autoPlay playsInline></video>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <button onClick={captureImage} style={styles.button}>Capture</button>
                                        <button onClick={stopCamera} style={{...styles.button, backgroundImage: 'linear-gradient(to right, #a0aec0, #718096)', boxShadow: 'none' }}>Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                    <label htmlFor="image-upload" style={styles.uploadBox} onMouseOver={e => e.currentTarget.style.backgroundColor='#eef2ff'} onMouseOut={e => e.currentTarget.style.backgroundColor='#ffffff'}>
                                        <span style={{ color: '#3b82f6', fontWeight: 600 }}>Upload a file</span> or drag and drop
                                    </label>
                                    <input type="file" id="image-upload" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                                    <p style={{color: '#a0aec0'}}>- OR -</p>
                                    <button onClick={openCamera} style={styles.button}>
                                        <Icon path="M10 12a2 2 0 100-4 2 2 0 000 4z M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" />
                                        Use Camera
                                    </button>
                                </div>
                            )}
                             <canvas ref={canvasRef} style={{display: 'none'}}></canvas>
                        </div>

                        <div style={styles.stepCard}>
                            <h2 style={styles.stepTitle}><span style={styles.stepNumber}>2</span> Select Language</h2>
                            <select id="target-language" value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value)} style={styles.selectInput}>
                                {languages.map((lang) => <option key={lang} value={lang}>{lang}</option>)}
                            </select>
                        </div>

                        <div style={styles.stepCard}>
                            <h2 style={styles.stepTitle}><span style={styles.stepNumber}>3</span> Get Translation</h2>
                            <button onClick={handleTranslate} disabled={isLoading || !selectedImage} style={{...styles.button, ...styles.buttonTranslate, ...(isLoading || !selectedImage ? {backgroundImage: 'none', backgroundColor: '#a0aec0', boxShadow: 'none', cursor: 'not-allowed'} : {})}}>
                                {isLoading ? 'Translating...' : 'Translate Signboard Text'}
                            </button>
                        </div>
                    </div>

                    {/* Right Column */}
                     <div style={styles.column}>
                        <div style={styles.imageDisplayBox}>
                            {selectedImage ? (
                                <>
                                    <img src={overlayedImage || `data:image/jpeg;base64,${selectedImage}`} alt="Source for translation" style={styles.imageElement} />
                                    <button onClick={handleClearImage} style={styles.clearButton} title="Clear Image">
                                        <Icon path="M6 18L18 6M6 6l12 12" className="w-4 h-4" style={{color: '#4a5568'}}/>
                                    </button>
                                </>
                            ) : (
                               <div style={{ textAlign: 'center', color: '#a0aec0' }}>
                                   <Icon path="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6l2-2m-2 2l-2-2m0 0l-2 2m2-2l2 2" className="w-16 h-16" style={{margin: '0 auto 1rem auto'}}/>
                                   <p>Your image will appear here</p>
                               </div>
                            )}
                        </div>
                        
                        {(extractedText || translatedText || error) && (
                            <div style={styles.resultsCard}>
                                {error && <div style={{backgroundColor: '#fff5f5', border: '1px solid #f56565', color: '#c53030', padding: '1rem', borderRadius: '8px', marginBottom: '1rem'}}>{error}</div>}
                                
                                {extractedText && <div style={{marginBottom: '1rem'}}>
                                    <h3 style={styles.resultsHeading}>Extracted Text</h3>
                                    <p style={styles.resultsTextBox}>{extractedText}</p>
                                </div>}
                                
                                {translatedText && <div style={{marginBottom: '1rem'}}>
                                    <h3 style={styles.resultsHeading}>Translated Text ({targetLanguage})</h3>
                                    <div style={{...styles.resultsTextBox, ...styles.translatedTextBox}}>
                                        <span>{translatedText}</span>
                                        <div style={styles.actionButtons}>
                                            <button onClick={() => handleSpeak(translatedText)} title="Speak"><Icon path="M4.055 6.257A1 1 0 003 7.172v5.656a1 1 0 001.055.915 8.001 8.001 0 010-7.488zM5 6.5A1.5 1.5 0 016.5 5h1A1.5 1.5 0 019 6.5v7a1.5 1.5 0 01-1.5 1.5h-1A1.5 1.5 0 015 13.5v-7zm6.5-1.5a.5.5 0 000 1h1a.5.5 0 000-1h-1zm0 2a.5.5 0 000 1h3a.5.5 0 000-1h-3zm0 2a.5.5 0 000 1h3a.5.5 0 000-1h-3zm0 2a.5.5 0 000 1h1a.5.5 0 000-1h-1z"/></button>
                                            <button onClick={() => handleCopyTranslatedText(translatedText)} title="Copy"><Icon path="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9zM4 3a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H4z"/></button>
                                        </div>
                                    </div>
                                </div>}

                                {contextualInfo && <div>
                                    <h3 style={styles.resultsHeading}>Contextual Info</h3>
                                    <p style={{...styles.resultsTextBox, ...styles.translatedTextBox}}>{contextualInfo}</p>
                                </div>}
                            </div>
                        )}
                    </div>
                </div>
                
                 <div style={styles.historyContainer}>
                    <h2 style={styles.stepTitle}>Translation History</h2>
                    <div style={styles.historyList}>
                        {history.length > 0 ? history.map((entry) => (
                            <div key={entry.id} style={{...styles.historyItem, ...(entry.isFavorite ? {borderColor: '#f6e05e', backgroundColor: '#fffbef'} : {})}}>
                                <img src={`data:image/jpeg;base64,${entry.originalImageThumbnail}`} alt="Thumbnail" style={styles.historyThumbnail} />
                                <div style={{flexGrow: 1}}>
                                    <p style={{fontFamily: 'monospace', fontSize: '0.9rem'}}><strong>Original:</strong> {entry.originalText}</p>
                                    <p style={{fontSize: '0.9rem'}}><strong>Translated:</strong> {entry.translatedText}</p>
                                    {entry.notes && <p style={{fontSize: '0.8rem', fontStyle: 'italic', marginTop: '0.25rem', color: '#718096'}}><strong>Note:</strong> {entry.notes}</p>}
                                </div>
                                <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                                    <button onClick={() => toggleFavorite(entry.id, entry.isFavorite)} style={{backgroundColor: entry.isFavorite ? '#f6e05e' : '#edf2f7', borderRadius: '50%', padding: '0.5rem', border: '1px solid #e2e8f0', cursor: 'pointer'}} title="Favorite"><Icon path="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.28 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" className="w-4 h-4" /></button>
                                    <button onClick={() => openNoteModal(entry.id, entry.notes)} style={{backgroundColor: '#edf2f7', borderRadius: '50%', padding: '0.5rem', border: '1px solid #e2e8f0', cursor: 'pointer'}} title="Add/Edit Note"><Icon path="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828zM5 17a1 1 0 01-1-1v-6a1 1 0 112 0v6a1 1 0 01-1 1z" className="w-4 h-4" /></button>
                                </div>
                            </div>
                        )) : <p style={{color: '#a0aec0', fontStyle: 'italic', textAlign: 'center', padding: '1rem'}}>No history yet.</p>}
                    </div>
                </div>
             </div>

             {isNoteModalOpen && (
                <div style={styles.modalOverlay}>
                    <div style={styles.modalContent}>
                        <h3 style={{fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem'}}>Add/Edit Note</h3>
                        <textarea style={{width: '100%', minHeight: '120px', padding: '0.75rem', border: '1px solid #cbd5e0', borderRadius: '8px'}} value={currentNote} onChange={(e) => setCurrentNote(e.target.value)} placeholder="Type your note here..."></textarea>
                        <div style={{display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem'}}>
                            <button onClick={() => setIsNoteModalOpen(false)} style={{...styles.button, width: 'auto', backgroundImage: 'none', backgroundColor: '#a0aec0', boxShadow: 'none', padding: '0.5rem 1rem'}}>Cancel</button>
                            <button onClick={saveNote} style={{...styles.button, width: 'auto', padding: '0.5rem 1rem'}}>Save Note</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;