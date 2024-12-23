// Añadir al inicio del archivo, después de los imports
declare global {
  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
  }
}

import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents,
} from "@heygen/streaming-avatar";

// DOM elements
const videoElement = document.getElementById("avatarVideo") as HTMLVideoElement;
const startButton = document.getElementById(
  "startSession"
) as HTMLButtonElement;
const endButton = document.getElementById("endSession") as HTMLButtonElement;
const speakButton = document.getElementById("speakButton") as HTMLButtonElement;
const userInput = document.getElementById("userInput") as HTMLInputElement;
const captureAudioButton = document.getElementById("captureAudioButton") as HTMLButtonElement;

let avatar: StreamingAvatar | null = null;
let sessionData: any = null;
let capturedText = "";
let isListening = false;
let silenceTimeout: NodeJS.Timeout | null = null;
let lastReadText = "";

// Verifica si el navegador soporta la API de reconocimiento de voz
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    const newCapturedText = event.results[0][0].transcript;
    console.log("Texto capturado:", newCapturedText);

    // Si el texto capturado ha cambiado, actualizar y llamar a /ask
    if (newCapturedText !== capturedText) {
      capturedText = newCapturedText;

      // Construir el payload
      const payload = {
        conversation: [],  // Conversación vacía
        genModel: "OCI_CommandRplus",
        message: capturedText  // Usar el texto capturado como mensaje
      };

      // Realizar la solicitud POST
      fetch('http://84.235.246.54:9000/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }).catch(error => console.error('Error calling /ask:', error));
    }

    // Reiniciar automáticamente el reconocimiento
    recognition.stop();
    setTimeout(() => {
      if (isListening) {
        recognition.start();
      }
    }, 3000); // Espera 3 segundos antes de escuchar la siguiente frase
  };

  recognition.onerror = (event) => {
    console.error("Error de reconocimiento de voz:", event.error);
  };

  captureAudioButton.addEventListener("click", () => {
    if (isListening) {
      recognition.stop();
      isListening = false;
      console.log("Captura de audio detenida");
      captureAudioButton.textContent = "Capture Audio";
    } else {
      recognition.start();
      isListening = true;
      console.log("Captura de audio iniciada");
      captureAudioButton.textContent = "Stop Capture Audio";
    }
  });
} else {
  console.error("La API de reconocimiento de voz no es compatible con este navegador.");
}

// Helper function to fetch access token
async function fetchAccessToken(): Promise<string> {
  const apiKey = import.meta.env.VITE_HEYGEN_API_KEY;
  const response = await fetch(
    "https://api.heygen.com/v1/streaming.create_token",
    {
      method: "POST",
      headers: { "x-api-key": apiKey },
    }
  );

  const { data } = await response.json();
  return data.token;
}

// Initialize streaming avatar session
async function initializeAvatarSession() {
  const token = await fetchAccessToken();
  avatar = new StreamingAvatar({ token });

  sessionData = await avatar.createStartAvatar({
    quality: AvatarQuality.High,
    avatarName: "ef08039a41354ed5a20565db899373f3",
  });

  console.log("Session data:", sessionData);
  
  // Iniciar el polling después de inicializar el avatar
  startPolling();

  // Enable end button and disable start button
  endButton.disabled = false;
  startButton.disabled = true;

  avatar.on(StreamingEvents.STREAM_READY, handleStreamReady);
  avatar.on(StreamingEvents.STREAM_DISCONNECTED, handleStreamDisconnected);
}

// Handle when avatar stream is ready
function handleStreamReady(event: any) {
  if (event.detail && videoElement) {
    videoElement.srcObject = event.detail;
    videoElement.onloadedmetadata = () => {
      videoElement.play().catch(console.error);
    };
  } else {
    console.error("Stream is not available");
  }
}

// Handle stream disconnection
function handleStreamDisconnected() {
  console.log("Stream disconnected");
  if (videoElement) {
    videoElement.srcObject = null;
  }

  // Enable start button and disable end button
  startButton.disabled = false;
  endButton.disabled = true;
}

// End the avatar session
async function terminateAvatarSession() {
  if (!avatar || !sessionData) return;

  await avatar.stopAvatar();
  videoElement.srcObject = null;
  avatar = null;
}

// Handle speaking event
async function handleSpeak() {
  if (avatar && userInput.value) {
    await avatar.speak({
      text: userInput.value,
      task_type: "repeat"
    });
    userInput.value = ""; // Clear input after speaking
  }
}

// Event listeners for buttons
startButton.addEventListener("click", initializeAvatarSession);
endButton.addEventListener("click", terminateAvatarSession);
speakButton.addEventListener("click", handleSpeak);

// Añadir la función para obtener y leer el texto
async function fetchAndReadText() {
  try {
    const response = await fetch('http://84.235.246.54:9000/get_string');
    const data = await response.json();
    const newText = data.value;

    // Solo leer si el texto es diferente al último leído
    if (newText !== lastReadText && avatar) {
      lastReadText = newText;
      await avatar.speak({ 
        text: newText,
        task_type: "repeat",  // Usar REPEAT en lugar del comportamiento por defecto
        task_mode: "SYNC"     // Asegurarse de que termine antes de la siguiente lectura
      });

      // Llamar a handleSpeak si el texto ha cambiado
      handleSpeak();

      // Imprimir "Texto Capturado"
      console.log("Texto Capturado");
    }
  } catch (error) {
    console.error('Error fetching text:', error);
  }
}

// Añadir después de initializeAvatarSession()
function startPolling() {
  // Hacer la primera llamada inmediatamente
  fetchAndReadText();
  // Configurar el intervalo
  setInterval(fetchAndReadText, 3000); // Cambiar a 3 segundos
}