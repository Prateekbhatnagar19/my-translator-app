// IMPORTANT: Tailwind CSS CDN is placed here, outside the React component.
// This ensures it is loaded and processed by the browser before React renders the DOM,
// resolving "tailwind is not defined" errors.
<script src="https://cdn.tailwindcss.com"></script>

import React, { useState, useEffect, useRef } from 'react';

// Import Firebase modules directly into the React component file
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, addDoc, query, onSnapshot, serverTimestamp, doc, updateDoc } from "firebase/firestore";

const App = () => {
    // State for image handling
    const [selectedImage, setSelectedImage] = useState(null);
    const [extractedText, setExtractedText] = useState('');
    const [translatedText, setTranslatedText] = useState('');
    const [contextualInfo, setContextualInfo] = useState(''); // New state for contextual info
    const [targetLanguage, setTargetLanguage] = useState('English');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [overlayedImage, setOverlayedImage] = useState(null); // New state for AR-like overlayed image

    // States for camera functionality
    const [isCameraActive, setIsCameraActive] = useState(false);
    const videoRef = useRef(null); // Ref to the video element for camera stream
    const canvasRef = useRef(null); // Ref to the canvas element for image capture
    const mediaStreamRef = useRef(null); // Ref to store the camera's media stream

    // Firebase related states and refs
    const [firebaseApp, setFirebaseApp] = useState(null);
    const [firestoreDb, setFirestoreDb] = useState(null);
    const [firebaseAuth, setFirebaseAuth] = useState(null);
    const [authReady, setAuthReady] = useState(false); // State to indicate Firebase Auth readiness
    const firestoreHistoryUnsubscribeRef = useRef(null); // Ref for history listener unsubscribe
    const isFirebaseInitializedRef = useRef(false); // To prevent double initialization

    // State for translation history
    const [history, setHistory] = useState([]); 

    // State for Note Modal
    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
    const [currentNote, setCurrentNote] = useState('');
    const [currentHistoryItemId, setCurrentHistoryItemId] = useState(null);

    // Predefined list of common languages
    const languages = [
        'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Hindi',
        'Chinese (Simplified)', 'Japanese', 'Korean', 'Arabic', 'Russian', 'Bengali',
        'Punjabi', 'Telugu', 'Marathi', 'Tamil', 'Urdu', 'Gujarati', 'Kannada', 'Malayalam'
    ];

    // Effect for Firebase Initialization and Authentication
    useEffect(() => {
        const initFirebase = async () => {
            if (isFirebaseInitializedRef.current) {
                console.log("Firebase already initialized within React useEffect. Skipping.");
                return;
            }

            try {
                // Access global environment variables for Firebase config
                const currentAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
                const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
                const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

                const appInstance = initializeApp(firebaseConfig);
                const dbInstance = getFirestore(appInstance);
                const authInstance = getAuth(appInstance);

                setFirebaseApp(appInstance);
                setFirestoreDb(dbInstance);
                setFirebaseAuth(authInstance);
                isFirebaseInitializedRef.current = true; // Mark as initialized

                console.log("Firebase app and Firestore initialized within React useEffect.");

                // Set up authentication state listener
                const unsubscribeAuth = onAuthStateChanged(authInstance, async (user) => {
                    if (!user) {
                        console.log("No user authenticated. Attempting anonymous or custom token sign-in.");
                        try {
                            if (initialAuthToken) {
                                await signInWithCustomToken(authInstance, initialAuthToken);
                                console.log("Signed in with custom token.");
                            } else {
                                await signInAnonymously(authInstance);
                                console.log("Signed in anonymously.");
                            }
                        } catch (authError) {
                            console.error("Firebase Auth Error during sign-in:", authError);
                            setError(`Authentication failed: ${authError.message}`);
                        }
                    } else {
                        console.log("User authenticated:", user.uid);
                        setAuthReady(true); // Mark auth as ready
                    }
                });

                // Cleanup Firebase Auth listener on component unmount
                return () => {
                    if (unsubscribeAuth) {
                        unsubscribeAuth();
                        console.log("Firebase Auth listener unsubscribed.");
                    }
                };

            } catch (err) {
                console.error("Failed to initialize Firebase:", err);
                setError(`Failed to load Firebase services: ${err.message}`);
                setAuthReady(false);
            }
        };

        // Call initFirebase
        initFirebase();

        // General cleanup for camera stream and history listener on overall component unmount
        return () => {
            if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach(track => track.stop());
                console.log("Camera stream stopped on unmount.");
            }
            if (firestoreHistoryUnsubscribeRef.current) {
                firestoreHistoryUnsubscribeRef.current(); // Unsubscribe history listener
                console.log("Firestore history listener unsubscribed on overall unmount.");
            }
        };

    }, []); // Empty dependency array means this effect runs once on mount

    // Effect for setting up Firestore History Listener, dependent on authReady and db instance
    useEffect(() => {
        if (authReady && firestoreDb && firebaseAuth?.currentUser) {
            console.log("Setting up history listener for user:", firebaseAuth.currentUser.uid);
            const currentAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const collectionPath = `artifacts/${currentAppId}/users/${firebaseAuth.currentUser.uid}/translations`;

            const q = query(collection(firestoreDb, collectionPath));
            
            const unsubscribeHistory = onSnapshot(q, (snapshot) => {
                const historyData = [];
                snapshot.forEach((doc) => {
                    historyData.push({ id: doc.id, ...doc.data() });
                });
                // Sort in memory by timestamp, latest first, handling undefined timestamps
                historyData.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
                setHistory(historyData);
                console.log("History updated:", historyData.length, "entries.");
            }, (error) => {
                console.error("Error listening to translation history:", error);
                setError(`Failed to load history: ${error.message}`);
                setHistory([]);
            });

            firestoreHistoryUnsubscribeRef.current = unsubscribeHistory; // Store unsubscribe function

            // Cleanup Firestore history listener when this effect re-runs or component unmounts
            return () => {
                if (unsubscribeHistory) {
                    unsubscribeHistory();
                    console.log("History listener unsubscribed.");
                }
            };
        } else {
            console.log("Firestore, Auth, or user not fully ready for history listener setup.");
            setHistory([]); // Clear history if not ready
        }
    }, [authReady, firestoreDb, firebaseAuth]); // Dependencies for history listener

    // Helper to get current user ID (for internal use, not display)
    const getActualUserId = () => {
        return firebaseAuth?.currentUser?.uid || localStorage.getItem('tempUserId') || (() => {
            const tempId = `temp-${crypto.randomUUID()}`;
            localStorage.setItem('tempUserId', tempId);
            return tempId;
        })();
    };

    // Helper to add translation history
    const addTranslationHistory = async (data) => {
        if (!firestoreDb || !firebaseAuth?.currentUser) {
            console.warn("Firestore not ready or user not authenticated. Cannot add history.");
            setError("Cannot save history: Authentication not ready.");
            return;
        }

        const currentAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const collectionPath = `artifacts/${currentAppId}/users/${getActualUserId()}/translations`;

        try {
            await addDoc(collection(firestoreDb, collectionPath), {
                ...data,
                timestamp: serverTimestamp()
            });
            console.log("Translation history added successfully.");
        } catch (e) {
            console.error("Error adding document to Firestore:", e);
            setError(`Failed to save history: ${e.message}`);
        }
    };

    // Helper to update translation history (e.g., for notes or favorites)
    const updateTranslationHistory = async (id, updatedFields) => {
        if (!firestoreDb || !firebaseAuth?.currentUser) {
            console.warn("Firestore not ready or user not authenticated. Cannot update history.");
            setError("Cannot update history: Authentication not ready.");
            return;
        }
        const currentAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const collectionPath = `artifacts/${currentAppId}/users/${getActualUserId()}/translations`;
        const docRef = doc(firestoreDb, collectionPath, id);
        try {
            await updateDoc(docRef, updatedFields);
            console.log("History item updated successfully.");
        } catch (e) {
            console.error("Error updating document: ", e);
            setError(`Failed to update history: ${e.message}`);
        }
    };

    /**
     * handleImageUpload: Processes the image file selected by the user from file input.
     * @param {Object} event - The change event from the file input element.
     */
    const handleImageUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            stopCamera(); // Stop camera if active to switch to file upload
            
            setExtractedText('');
            setTranslatedText('');
            setContextualInfo(''); // Clear contextual info
            setOverlayedImage(null); // Clear overlayed image
            setError(''); 

            const reader = new FileReader();
            reader.onloadend = () => {
                setSelectedImage(reader.result.split(',')[1]);
            };
            reader.onerror = () => {
                setError('Failed to read the image file.');
            };
            reader.readAsDataURL(file);
        } else {
            setSelectedImage(null);
            setExtractedText('');
            setTranslatedText('');
            setContextualInfo(''); // Clear contextual info
            setOverlayedImage(null); // Clear overlayed image
        }
    };

    /**
     * handleClearImage: Resets the image selection and translation results.
     * Also stops the camera if active.
     */
    const handleClearImage = () => {
        setSelectedImage(null);
        setExtractedText('');
        setTranslatedText('');
        setContextualInfo(''); // Clear contextual info
        setOverlayedImage(null); // Clear overlayed image
        setError('');
        const fileInput = document.getElementById('image-upload');
        if (fileInput) fileInput.value = ''; // Reset file input
        stopCamera(); // Ensure camera is stopped when clearing image
    };

    /**
     * openCamera: Activates the user's camera and displays the stream.
     */
    const openCamera = async () => {
        setSelectedImage(null); // Clear any existing image
        setExtractedText('');
        setTranslatedText('');
        setContextualInfo(''); // Clear contextual info
        setOverlayedImage(null); // Clear overlayed image
        setError('');

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); // Prefer rear camera
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
                setIsCameraActive(true);
                mediaStreamRef.current = stream; // Store the stream for later stopping
            }
        } catch (err) {
            console.error("Error accessing camera: ", err);
            setError(`Failed to access camera. Please ensure permissions are granted and no other app is using it. Error: ${err.message}`);
            setIsCameraActive(false);
        }
    };

    /**
     * stopCamera: Stops the active camera stream.
     */
    const stopCamera = () => {
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }
        setIsCameraActive(false);
    };

    /**
     * captureImage: Captures a frame from the video stream and converts it to Base64.
     */
    const captureImage = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d');
            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            const imageData = canvas.toDataURL('image/jpeg', 0.9);
            setSelectedImage(imageData.split(',')[1]); // Store only the base64 data

            stopCamera(); // Stop camera after capturing
        }
    };

    /**
     * handleSpeak: Uses Web Speech API to speak the provided text.
     * @param {string} textToSpeak - The text to be spoken.
     */
    const handleSpeak = (textToSpeak) => {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            utterance.lang = targetLanguage === 'Chinese (Simplified)' ? 'zh-CN' :
                             targetLanguage === 'Japanese' ? 'ja-JP' :
                             targetLanguage === 'Korean' ? 'ko-KR' :
                             targetLanguage === 'Arabic' ? 'ar-SA' :
                             targetLanguage === 'Russian' ? 'ru-RU' :
                             targetLanguage === 'Hindi' ? 'hi-IN' :
                             targetLanguage === 'Spanish' ? 'es-ES' :
                             targetLanguage === 'French' ? 'fr-FR' :
                             targetLanguage === 'German' ? 'de-DE' :
                             targetLanguage === 'Italian' ? 'it-IT' :
                             targetLanguage === 'Portuguese' ? 'pt-PT' :
                             'en-US'; // Default to US English

            window.speechSynthesis.speak(utterance);
        } else {
            setError("Text-to-speech not supported in your browser.");
        }
    };

    /**
     * handleCopyTranslatedText: Copies the translated text to the clipboard.
     * @param {string} textToCopy - The text to copy.
     */
    const handleCopyTranslatedText = (textToCopy) => {
        // Fallback for document.execCommand('copy') due to iFrame restrictions
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        textarea.style.position = 'fixed'; // Prevents scrolling to bottom
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try {
            document.execCommand('copy');
            alert('Translated text copied to clipboard!'); // Using alert for demo, replace with custom modal
        } catch (err) {
            console.error('Failed to copy text: ', err);
            setError('Failed to copy text to clipboard.');
        } finally {
            document.body.removeChild(textarea);
        }
    };

    /**
     * toggleFavorite: Toggles the favorite status of a history item.
     * @param {string} id - The Firestore document ID of the history item.
     * @param {boolean} currentStatus - The current favorite status.
     */
    const toggleFavorite = (id, currentStatus) => {
        updateTranslationHistory(id, { isFavorite: !currentStatus });
    };

    /**
     * openNoteModal: Opens the modal for adding/editing notes.
     * @param {string} id - The Firestore document ID of the history item.
     * @param {string} existingNote - The existing note for the item.
     */
    const openNoteModal = (id, existingNote) => {
        setCurrentHistoryItemId(id);
        setCurrentNote(existingNote || '');
        setIsNoteModalOpen(true);
    };

    /**
     * saveNote: Saves the note to the Firestore history item.
     */
    const saveNote = () => {
        if (currentHistoryItemId) {
            updateTranslationHistory(currentHistoryItemId, { notes: currentNote });
            setIsNoteModalOpen(false);
            setCurrentHistoryItemId(null);
            setCurrentNote('');
        }
    };

    /**
     * drawTextOnImage: Draws text onto an image on a canvas.
     * @param {HTMLImageElement} img - The image element.
     * @param {string} text - The text to draw.
     * @returns {string} - Data URL of the canvas with text.
     */
    const drawTextOnImage = (img, text) => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0, img.width, img.height);

        // Text styling for overlay
        ctx.font = `${Math.max(16, img.height / 20)}px Inter, sans-serif`; // Responsive font size
        ctx.fillStyle = '#FFD700'; // Gold color for translated text
        ctx.strokeStyle = '#000000'; // Black stroke for readability
        ctx.lineWidth = 2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom'; // Draw text from the bottom edge upwards

        const lines = text.split('\n');
        const lineHeight = parseInt(ctx.font) * 1.2; // 1.2 times font size
        let y = img.height - 10; // Start 10px from the bottom

        // Draw lines from bottom up
        for (let i = lines.length - 1; i >= 0; i--) {
            ctx.strokeText(lines[i], img.width / 2, y);
            ctx.fillText(lines[i], img.width / 2, y);
            y -= lineHeight;
        }

        return tempCanvas.toDataURL('image/jpeg', 0.9);
    };

    /**
     * handleTranslate: Orchestrates the core functionality:
     * 1. Sends the image to the Gemini Vision API for text extraction (simulating OCR).
     * 2. Sends the extracted text to the Gemini Text Generation API for translation.
     * 3. Sends another request for contextual/cultural info.
     * 4. Overlays translated text on the original image for display.
     * 5. Saves the translation and info to Firestore history.
     */
    const handleTranslate = async () => {
        if (!selectedImage) {
            setError('Please upload or capture an image first to translate.');
            return;
        }

        setIsLoading(true);
        setError('');
        setExtractedText('');
        setTranslatedText('');
        setContextualInfo('');
        setOverlayedImage(null); // Clear previous overlay

        try {
            // --- Step 1: Text Extraction (Vision API) ---
            // Enhanced prompt for multi-text recognition
            const visionPrompt = "Extract all visible text from this image. If there are multiple distinct blocks of text (e.g., separate signs, lists, different paragraphs), please list them individually, perhaps with numbering or bullet points. Do not include any descriptions of the image, only the extracted text.";
            const visionPayload = {
                contents: [
                    {
                        role: "user",
                        parts: [
                            { text: visionPrompt },
                            {
                                inlineData: {
                                    mimeType: "image/jpeg",
                                    data: selectedImage
                                }
                            }
                        ]
                    }
                ]
            };

            const apiKey = "";
            const visionApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

            const visionResponse = await fetch(visionApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(visionPayload)
            });

            if (!visionResponse.ok) {
                const errorData = await visionResponse.json();
                throw new Error(`Text extraction failed: ${errorData.error?.message || visionResponse.statusText}`);
            }

            const visionResult = await visionResponse.json();
            let extracted = '';
            if (visionResult.candidates && visionResult.candidates.length > 0 &&
                visionResult.candidates[0].content && visionResult.candidates[0].content.parts &&
                visionResult.candidates[0].content.parts.length > 0) {
                extracted = visionResult.candidates[0].content.parts[0].text.trim();
                setExtractedText(extracted);
            } else {
                extracted = 'No text could be extracted from the image. Please try a clearer image.';
                setExtractedText(extracted);
            }

            if (!extracted || extracted.includes('No text could be extracted') || extracted.length < 3) {
                setIsLoading(false);
                return;
            }

            // --- Step 2: Translation (Text Generation API) ---
            const translationPrompt = `Translate the following text into ${targetLanguage}: "${extracted}"`;
            const translationPayload = {
                contents: [{ role: "user", parts: [{ text: translationPrompt }] }]
            };
            const translationApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

            const translationResponse = await fetch(translationApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(translationPayload)
            });

            if (!translationResponse.ok) {
                const errorData = await translationResponse.json();
                throw new Error(`Translation failed: ${errorData.error?.message || translationResponse.statusText}`);
            }

            const translationResult = await translationResponse.json();
            let translated = '';
            if (translationResult.candidates && translationResult.candidates.length > 0 &&
                translationResult.candidates[0].content && translationResult.candidates[0].content.parts &&
                translationResult.candidates[0].content.parts.length > 0) {
                translated = translationResult.candidates[0].content.parts[0].text.trim();
                setTranslatedText(translated);

                // --- Step 3: Get Contextual Info (New LLM Call) ---
                const contextPrompt = `Provide a brief cultural context or additional relevant information (e.g., common usage, related items, cultural nuances) for the following text: "${extracted}". If it's a common word, explain its typical usage. If it's a food item, describe it briefly. Keep it concise.`;
                const contextPayload = {
                    contents: [{ role: "user", parts: [{ text: contextPrompt }] }]
                };
                const contextApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
                
                const contextResponse = await fetch(contextApiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(contextPayload)
                });

                let context = '';
                if (contextResponse.ok) {
                    const contextResult = await contextResponse.json();
                    if (contextResult.candidates && contextResult.candidates.length > 0 &&
                        contextResult.candidates[0].content && contextResult.candidates[0].content.parts &&
                        contextResult.candidates[0].content.parts.length > 0) {
                        context = contextResult.candidates[0].content.parts[0].text.trim();
                        setContextualInfo(context);
                    }
                } else {
                    console.warn("Failed to get contextual info:", contextResponse.statusText);
                    setContextualInfo('No additional context available.');
                }

                // --- Step 4: Overlay translated text on image for AR-like display ---
                const img = new Image();
                img.src = `data:image/jpeg;base64,${selectedImage}`;
                img.onload = () => {
                    const overlaidDataUrl = drawTextOnImage(img, translated);
                    setOverlayedImage(overlaidDataUrl);

                    // --- Step 5: Save to History (Firestore) ---
                    const thumbCanvas = document.createElement('canvas');
                    const MAX_THUMB_WIDTH = 100;
                    const scale = MAX_THUMB_WIDTH / img.width;
                    thumbCanvas.width = MAX_THUMB_WIDTH;
                    thumbCanvas.height = img.height * scale;
                    const thumbCtx = thumbCanvas.getContext('2d');
                    thumbCtx.drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);
                    const thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.7).split(',')[1];

                    addTranslationHistory({
                        originalImageThumbnail: thumbnail,
                        originalText: extracted,
                        translatedText: translated,
                        contextualInfo: context,
                        targetLanguage: targetLanguage,
                        isFavorite: false,
                        notes: ''
                    });
                };
                img.onerror = () => {
                    console.error("Failed to load image for overlay/thumbnail.");
                    // Still save to history even if overlay fails
                    addTranslationHistory({
                        originalText: extracted,
                        translatedText: translated,
                        contextualInfo: context,
                        targetLanguage: targetLanguage,
                        isFavorite: false,
                        notes: ''
                    });
                };

            } else {
                setTranslatedText('Translation could not be generated for the extracted text.');
                setContextualInfo('');
            }

        } catch (err) {
            console.error("Translation process error:", err);
            setError(`An error occurred during translation: ${err.message}`);
            setExtractedText('');
            setTranslatedText('');
            setContextualInfo('');
            setOverlayedImage(null);
        } finally {
            setIsLoading(false);
        }
    };

    // Render a loading spinner or message until Firebase is fully loaded and auth is confirmed
    if (!authReady) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 text-gray-700">
                <svg className="animate-spin h-8 w-8 mr-3 text-blue-600" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading application...
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-700 via-blue-800 to-blue-900 flex items-center justify-center p-4 font-sans text-white overflow-auto">
            <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-2xl w-full max-w-sm md:max-w-xl lg:max-w-3xl xl:max-w-4xl border border-blue-500 transform transition-all duration-500 hover:shadow-3xl-lg scale-95 md:scale-100">
                
                {/* Header Section */}
                <header className="text-center mb-6 sm:mb-8">
                    <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-2 tracking-tight">
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-400 via-cyan-400 to-blue-500 animate-pulse">
                            Multilingual Image Text Translator
                        </span>
                    </h1>
                    <p className="text-center text-blue-100 mt-4 text-base sm:text-lg">
                        Effortlessly translate text from signboards, banners, and hoardings!
                    </p>
                    {/* User ID display intentionally removed as per user request */}
                </header>

                {/* Main Input Section: Choose between File Upload or Camera */}
                <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 sm:p-6 rounded-2xl border border-blue-300 shadow-xl">
                    <h2 className="block text-lg sm:text-xl font-bold text-gray-800 mb-4 flex items-center">
                        <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-blue-700" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-4 4 4 4-4V5h-2a1 1 0 100 2h2v6l-3-3-4 4zm-9-9a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd"></path></svg>
                        1. Choose Image Source
                    </h2>
                    
                    {/* Camera Interface */}
                    {isCameraActive ? (
                        <div className="flex flex-col items-center space-y-4">
                            <video ref={videoRef} className="w-full max-h-80 object-cover rounded-lg shadow-md border border-gray-300" autoPlay playsInline></video>
                            <div className="flex space-x-4 mt-2"> {/* Added margin top */}
                                <button
                                    onClick={captureImage}
                                    className="px-5 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white font-semibold rounded-full shadow-md hover:from-green-600 hover:to-green-700 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-75 transition duration-200 ease-in-out transform hover:scale-105 flex items-center text-sm sm:text-base"
                                >
                                    <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586A2 2 0 0111.12 3.454l.566-1.132A1 1 0 0011 2H9a1 1 0 00-.566.216l.566 1.132A2 2 0 017.586 5H6zm4.622 1.944A3 3 0 1010 13a3 3 0 00-1.378-2.056z" clipRule="evenodd"></path></svg>
                                    Click Image
                                </button>
                                <button
                                    onClick={stopCamera}
                                    className="px-5 py-2 bg-gradient-to-r from-gray-500 to-gray-600 text-white font-semibold rounded-full shadow-md hover:from-gray-600 hover:to-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-opacity-75 transition duration-200 ease-in-out transform hover:scale-105 flex items-center text-sm sm:text-base"
                                >
                                    <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"></path></svg>
                                    Close Camera
                                </button>
                            </div>
                        </div>
                    ) : (
                        // File Upload Interface
                        <div className="flex flex-col items-center space-y-4">
                            <input
                                type="file"
                                id="image-upload"
                                accept="image/jpeg, image/png, image/webp"
                                onChange={handleImageUpload}
                                className="w-full p-2 sm:p-3 border border-blue-400 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition duration-300 ease-in-out file:mr-2 file:py-1 file:px-3 sm:file:mr-4 sm:file:py-2 sm:file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-300 file:text-blue-900 hover:file:bg-blue-400 cursor-pointer shadow-inner hover:shadow-md"
                            />
                            <p className="text-gray-600 text-sm italic">- OR -</p>
                            <button
                                onClick={openCamera}
                                className="px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-600 text-white font-semibold rounded-full shadow-md hover:from-blue-600 hover:to-cyan-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75 transition duration-200 ease-in-out transform hover:scale-105 flex items-center text-sm sm:text-base"
                            >
                                <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"></path><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"></path></svg>
                                Open Camera
                            </button>
                        </div>
                    )}

                    {/* Hidden canvas for image capture, not displayed in UI */}
                    <canvas ref={canvasRef} className="hidden"></canvas>

                    {selectedImage && (
                        <div className="mt-4 sm:mt-5 flex flex-col items-center">
                            {/* Display the overlayed image if available, otherwise the original selected image */}
                            <img
                                src={overlayedImage || `data:image/jpeg;base64,${selectedImage}`}
                                alt="Source for translation"
                                className="max-w-full h-32 sm:h-48 lg:h-64 object-contain rounded-lg shadow-xl border-4 border-blue-400 transition-transform duration-300 transform hover:scale-102"
                            />
                            {/* Button to clear the current image and allow new upload / camera capture */}
                            <button
                                onClick={handleClearImage}
                                className="mt-3 sm:mt-4 px-5 py-2 bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold rounded-full shadow-lg hover:from-red-700 hover:to-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-75 transition duration-300 ease-in-out transform hover:scale-105 flex items-center text-sm sm:text-base"
                            >
                                <svg className="w-3 h-3 sm:w-4 sm:h-4 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 11-2 0v6a1 1 0 112 0V8z" clipRule="evenodd"></path></svg>
                                Clear Image / Start Over
                            </button>
                        </div>
                    )}
                </div>

                {/* Section for Language Selection */}
                <div className="mb-6 bg-gradient-to-r from-purple-100 to-pink-100 p-4 sm:p-6 rounded-2xl border border-purple-300 shadow-xl">
                    <label htmlFor="target-language" className="block text-lg sm:text-xl font-bold text-gray-800 mb-3 flex items-center">
                        <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-purple-700" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"></path></svg>
                        2. Select Target Language
                    </label>
                    <select
                        id="target-language"
                        value={targetLanguage}
                        onChange={(e) => setTargetLanguage(e.target.value)}
                        className="w-full p-2 sm:p-3 border border-purple-400 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-purple-600 bg-white text-gray-800 appearance-none pr-8 transition duration-300 ease-in-out cursor-pointer shadow-sm hover:shadow-md text-sm sm:text-base"
                    >
                        {languages.map((lang) => (
                            <option key={lang} value={lang}>
                                {lang}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Translate Button */}
                <div className="mb-6 sm:mb-8 text-center">
                    <button
                        onClick={handleTranslate}
                        disabled={isLoading || !selectedImage}
                        className="w-full md:w-auto px-8 sm:px-10 py-2 sm:py-3 bg-gradient-to-r from-green-500 to-teal-600 text-white font-bold rounded-full shadow-lg hover:from-green-600 hover:to-teal-700 focus:outline-none focus:ring-4 focus:ring-green-300 transition duration-300 ease-in-out transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-base sm:text-lg animate-pulse"
                    >
                        {isLoading ? (
                            <>
                                <svg className="animate-spin h-5 w-5 sm:h-6 sm:w-6 mr-2 sm:mr-3 text-white" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Translating...
                            </>
                        ) : (
                            '3. Translate Signboard Text'
                        )}
                    </button>
                </div>

                {/* Results and Error Display Section */}
                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-6 shadow-md ring-1 ring-red-200 text-sm sm:text-base">
                        <strong className="font-bold">Error:</strong>
                        <span className="block sm:inline ml-2">{error}</span>
                    </div>
                )}

                {(extractedText || translatedText || contextualInfo) && !isLoading && (
                    <div className="bg-gradient-to-br from-gray-100 to-gray-200 p-4 sm:p-6 rounded-2xl shadow-xl border border-gray-300">
                        <div className="mb-4 sm:mb-6">
                            <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-2 sm:mb-3 flex items-center">
                                <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-blue-700" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M7 3a1 1 0 00-1 1v1a1 1 0 002 0V4a1 1 0 00-1-1zM14 3a1 1 0 00-1 1v1a1 1 0 002 0V4a1 1 0 00-1-1zM4 7a1 1 0 00-1 1v6a1 1 0 001 1h12a1 1 0 001-1V8a1 1 0 00-1-1H4zm3 2h6v4H7V9z"></path></svg>
                                Extracted Text (OCR):
                            </h2>
                            <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-400 min-h-[70px] sm:min-h-[80px] text-gray-700 whitespace-pre-wrap break-words font-mono text-sm sm:text-base shadow-inner">
                                {extractedText || 'No text extracted yet.'}
                            </div>
                        </div>
                        <div className="mb-4 sm:mb-6">
                            <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-2 sm:mb-3 flex items-center">
                                <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-purple-700" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM7 9a1 1 0 00-1 1v1a1 1 0 002 0v-1a1 1 0 00-1-1zm3 0a1 1 0 00-1 1v1a1 1 0 002 0v-1a1 1 0 00-1-1zm3 0a1 1 0 00-1 1v1a1 1 0 002 0v-1a1 1 0 00-1-1z" clipRule="evenodd"></path></svg>
                                Translated Text ({targetLanguage}):
                            </h2>
                            <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-400 min-h-[70px] sm:min-h-[80px] text-gray-700 whitespace-pre-wrap break-words font-sans text-sm sm:text-base shadow-inner flex justify-between items-center">
                                <span className="flex-grow">{translatedText || 'Translation will appear here.'}</span>
                                {translatedText && (
                                    <div className="flex-shrink-0 flex space-x-2 ml-4">
                                        <button
                                            onClick={() => handleSpeak(translatedText)}
                                            className="p-2 rounded-full bg-blue-500 text-white shadow-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 transition duration-200 ease-in-out"
                                            title="Speak Translated Text"
                                        >
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M9.383 3.013A1 1 0 0110 2v16a1 1 0 01-1.383.987l-6-3a1 1 0 01-.617-.92V6.026a1 1 0 01.617-.92l6-3zM14.058 7.37a1 1 0 00-1.616 1.18L14.73 10l-2.288 1.45a1 1 0 001.616 1.18L16.27 10l-2.212-2.63z" clipRule="evenodd"></path></svg>
                                        </button>
                                        <button
                                            onClick={() => handleCopyTranslatedText(translatedText)}
                                            className="p-2 rounded-full bg-yellow-500 text-white shadow-md hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-400 transition duration-200 ease-in-out"
                                            title="Copy Translated Text"
                                        >
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"></path><path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h4a2 2 0 002-2V5a2 2 0 00-2-2H6z"></path><path d="M14 3a2 2 0 00-2 2v11a2 2 0 002 2h4a2 2 0 002-2V5a2 2 0 00-2-2h-4z"></path></svg>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                        {contextualInfo && (
                            <div>
                                <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-2 sm:mb-3 flex items-center mt-4">
                                    <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-orange-700" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM7 9a1 1 0 00-1 1v1a1 1 0 002 0v-1a1 1 0 00-1-1zm3 0a1 1 0 00-1 1v1a1 1 0 002 0v-1a1 1 0 00-1-1zm3 0a1 1 0 00-1 1v1a1 1 0 002 0v-1a1 1 0 00-1-1z" clipRule="evenodd"></path></svg>
                                    Contextual Info:
                                </h2>
                                <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-400 min-h-[70px] sm:min-h-[80px] text-gray-700 whitespace-pre-wrap break-words font-sans text-sm sm:text-base shadow-inner">
                                    {contextualInfo}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Translation History Section */}
                <div className="mt-8 bg-gradient-to-r from-gray-50 to-gray-100 p-4 sm:p-6 rounded-2xl border border-gray-300 shadow-xl">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 flex items-center">
                        <svg className="w-5 h-5 sm:w-6 sm:h-6 mr-2 text-gray-600" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l3 3a1 1 0 001.414-1.414L11 9.586V6z" clipRule="evenodd"></path></svg>
                        Translation History
                    </h2>
                    {history.length === 0 ? (
                        <p className="text-gray-600 italic text-center">No translation history yet. Translate an image to see it here!</p>
                    ) : (
                        <div className="max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {history.map((entry, index) => (
                                <div key={entry.id || index} className={`mb-4 p-3 border rounded-lg bg-white shadow-sm flex flex-col sm:flex-row items-start sm:items-center last:mb-0 ${entry.isFavorite ? 'border-yellow-500 ring-2 ring-yellow-300' : 'border-gray-200'}`}>
                                    {entry.originalImageThumbnail && (
                                        <div className="flex-shrink-0 mb-2 sm:mb-0 sm:mr-4">
                                            <img
                                                src={`data:image/jpeg;base64,${entry.originalImageThumbnail}`}
                                                alt="Original Thumbnail"
                                                className="w-16 h-16 object-cover rounded-md border border-gray-200"
                                            />
                                        </div>
                                    )}
                                    <div className="flex-grow text-sm">
                                        <p className="text-gray-700">
                                            <strong className="font-semibold">Original:</strong> <span className="font-mono">{entry.originalText}</span>
                                        </p>
                                        <p className="text-gray-700 mt-1">
                                            <strong className="font-semibold">Translated ({entry.targetLanguage}):</strong> {entry.translatedText}
                                        </p>
                                        {entry.contextualInfo && entry.contextualInfo !== 'No additional context available.' && (
                                            <p className="text-gray-600 text-xs mt-1 italic">
                                                <strong className="font-semibold">Context:</strong> {entry.contextualInfo}
                                            </p>
                                        )}
                                        {entry.notes && (
                                            <p className="text-gray-600 text-xs mt-1">
                                                <strong className="font-semibold">Note:</strong> {entry.notes}
                                            </p>
                                        )}
                                        {entry.timestamp && (
                                            <p className="text-gray-500 text-xs mt-1">
                                                {entry.timestamp.toDate ? entry.timestamp.toDate().toLocaleString() : new Date(entry.timestamp.seconds * 1000).toLocaleString()}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex-shrink-0 mt-2 sm:mt-0 sm:ml-4 flex flex-col space-y-2">
                                        <button
                                            onClick={() => toggleFavorite(entry.id, entry.isFavorite)}
                                            className={`p-2 rounded-full shadow-md transition duration-200 ease-in-out ${entry.isFavorite ? 'bg-yellow-400 hover:bg-yellow-500 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
                                            title={entry.isFavorite ? "Unfavorite" : "Favorite"}
                                        >
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M10 18.27L3.4 22l1.04-7.5L0 10.51l7.56-.55L10 3l2.44 6.96 7.56.55-5.44 3.99L16.6 22z" clipRule="evenodd"></path></svg>
                                        </button>
                                        <button
                                            onClick={() => openNoteModal(entry.id, entry.notes)}
                                            className="p-2 rounded-full bg-blue-300 text-blue-900 shadow-md hover:bg-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 transition duration-200 ease-in-out"
                                            title="Add/Edit Note"
                                        >
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z"></path><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd"></path></svg>
                                        </button>
                                        <button
                                            onClick={() => handleCopyTranslatedText(entry.translatedText)}
                                            className="p-2 rounded-full bg-yellow-500 text-white shadow-md hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-400 transition duration-200 ease-in-out"
                                            title="Copy Translated Text"
                                        >
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"></path><path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h4a2 2 0 002-2V5a2 2 0 00-2-2H6z"></path><path d="M14 3a2 2 0 00-2 2v11a2 2 0 002 2h4a2 2 0 002-2V5a2 2 0 00-2-2h-4z"></path></svg>
                                        </button>
                                        {/* No "Edit Original Text" as this would require re-running Vision API,
                                            which is beyond simple history editing. */}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Note Modal */}
            {isNoteModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
                        <h3 className="text-xl font-bold text-gray-800 mb-4">Add/Edit Note</h3>
                        <textarea
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 min-h-[100px]"
                            value={currentNote}
                            onChange={(e) => setCurrentNote(e.target.value)}
                            placeholder="Type your note here..."
                        ></textarea>
                        <div className="flex justify-end space-x-3 mt-4">
                            <button
                                onClick={() => setIsNoteModalOpen(false)}
                                className="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition duration-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveNote}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200"
                            >
                                Save Note
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;