import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { GenerateContentParameters, GenerateContentResponse } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';

app.use(express.json({ limit: '50mb' }));

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in server environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isTransientError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const lower = raw.toLowerCase();
  return (
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('timeout') ||
    lower.includes('internal')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateContentWithRetry(
  ai: GoogleGenAI,
  params: Omit<GenerateContentParameters, 'model'>,
): Promise<GenerateContentResponse> {
  const attemptsPerModel = [
    { model: PRIMARY_MODEL, thinkingLevel: ThinkingLevel.LOW, delays: [600, 1400] },
    { model: FALLBACK_MODEL, thinkingLevel: ThinkingLevel.MINIMAL, delays: [800] },
  ];

  let lastError: unknown;
  for (const tier of attemptsPerModel) {
    const maxTries = tier.delays.length + 1;
    for (let attempt = 0; attempt < maxTries; attempt++) {
      try {
        return await ai.models.generateContent({
          ...params,
          model: tier.model,
          config: {
            ...params.config,
            thinkingConfig: { thinkingLevel: tier.thinkingLevel },
          },
        });
      } catch (err) {
        lastError = err;
        if (!isTransientError(err)) {
          throw err;
        }
        if (attempt < tier.delays.length) {
          const jitter = Math.floor(Math.random() * 250);
          console.warn(
            `[${tier.model}] Transient error on attempt ${attempt + 1}; retrying in ${
              tier.delays[attempt] + jitter
            }ms...`,
          );
          await sleep(tier.delays[attempt] + jitter);
        } else {
          console.warn(`[${tier.model}] Exhausted retries; switching fallback if available.`);
        }
      }
    }
  }
  throw lastError;
}

function extractCleanErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : 'Unexpected server error while calling Gemini API.';
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    if (parsed?.error?.message) {
      return parsed.error.message;
    }
  } catch {
    // Raw message is plain text
  }
  return raw;
}

function handleApiError(res: Response, error: unknown, context: string) {
  console.error(`[${context}] Error:`, error);
  const message = extractCleanErrorMessage(error);
  const lower = message.toLowerCase();
  if (lower.includes('api_key_invalid') || lower.includes('permission_denied') || lower.includes('403')) {
    return res.status(403).json({
      error: 'API key permission denied or invalid. Check GEMINI_API_KEY in Settings > Secrets.',
    });
  }
  if (lower.includes('resource_exhausted') || lower.includes('429')) {
    return res.status(429).json({
      error: 'API rate limit or quota reached. Please retry shortly or verify billing settings.',
    });
  }
  if (
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded')
  ) {
    return res.status(503).json({
      error:
        'The AI model is temporarily experiencing high demand after automatic retries. Please click Analyze again in a few seconds.',
    });
  }
  if (lower.includes('not configured')) {
    return res.status(500).json({ error: message });
  }
  return res.status(500).json({ error: message });
}

function stripDataUrlPrefix(base64OrDataUrl: string): string {
  const idx = base64OrDataUrl.indexOf('base64,');
  return idx !== -1 ? base64OrDataUrl.slice(idx + 7) : base64OrDataUrl;
}

function clampBox(box: unknown): [number, number, number, number] {
  if (!Array.isArray(box) || box.length !== 4) {
    return [100, 100, 900, 900];
  }
  const nums = box.map((n) => {
    const val = Number(n);
    if (!Number.isFinite(val)) return 0;
    return Math.max(0, Math.min(1000, Math.round(val)));
  });
  const ymin = Math.min(nums[0], nums[2]);
  const xmin = Math.min(nums[1], nums[3]);
  const ymax = Math.max(nums[0], nums[2]);
  const xmax = Math.max(nums[1], nums[3]);
  return [ymin, xmin, ymax, xmax];
}

// 1. Car Colour Detection Endpoint
app.post('/api/analyze/car-color', async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body as {
      imageBase64?: string;
      mimeType?: string;
    };
    if (!imageBase64) {
      return res.status(400).json({ error: 'Image payload is required.' });
    }

    const ai = getGeminiClient();
    const response = await generateContentWithRetry(ai, {
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: stripDataUrlPrefix(imageBase64),
            },
          },
          {
            text:
              'Analyze this traffic scene carefully. Detect EVERY car/vehicle visible in the traffic or near the traffic signal, and identify each car\'s primary exterior paint colour (e.g., Blue, White, Red, Silver, Black, Gray, Green, Yellow). ' +
              'Set isBlue to true ONLY if the car\'s colour is blue (light blue, dark blue, navy, royal blue). Set isBlue to false for all other colours. ' +
              'Also detect and count EVERY person/pedestrian visible at or near the traffic signal or sidewalks. ' +
              'For each car and each person, provide accurate bounding box coordinates [ymin, xmin, ymax, xmax] scaled from 0 to 1000.',
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            cars: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  color: { type: Type.STRING },
                  isBlue: { type: Type.BOOLEAN },
                  vehicleType: { type: Type.STRING },
                  confidence: { type: Type.NUMBER },
                  box_2d: {
                    type: Type.ARRAY,
                    items: { type: Type.INTEGER },
                  },
                },
                required: ['color', 'isBlue', 'vehicleType', 'confidence', 'box_2d'],
              },
            },
            people: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  locationNote: { type: Type.STRING },
                  box_2d: {
                    type: Type.ARRAY,
                    items: { type: Type.INTEGER },
                  },
                },
                required: ['locationNote', 'box_2d'],
              },
            },
            summary: { type: Type.STRING },
          },
          required: ['cars', 'people', 'summary'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    const cars = Array.isArray(parsed.cars)
      ? parsed.cars.map((c: Record<string, unknown>, idx: number) => {
          const colorName = String(c.color || 'Unknown');
          const isBlue = Boolean(c.isBlue) || colorName.toLowerCase().includes('blue');
          return {
            id: `car-${idx + 1}`,
            color: colorName,
            isBlue,
            vehicleType: String(c.vehicleType || 'Car'),
            confidence: Number(c.confidence ?? 0.9),
            box_2d: clampBox(c.box_2d),
          };
        })
      : [];

    const people = Array.isArray(parsed.people)
      ? parsed.people.map((p: Record<string, unknown>, idx: number) => ({
          id: `person-${idx + 1}`,
          locationNote: String(p.locationNote || 'At traffic signal'),
          box_2d: clampBox(p.box_2d),
        }))
      : [];

    const blueCarsCount = cars.filter((c: { isBlue: boolean }) => c.isBlue).length;
    const otherCarsCount = cars.length - blueCarsCount;

    return res.json({
      cars,
      people,
      totalCars: cars.length,
      blueCarsCount,
      otherCarsCount,
      peopleCount: people.length,
      summary: String(
        parsed.summary ||
          `Detected ${cars.length} car(s) (${blueCarsCount} blue, ${otherCarsCount} other colours) and ${people.length} pedestrian(s).`,
      ),
    });
  } catch (error) {
    return handleApiError(res, error, 'car-color');
  }
});

// 2. Animal Detection Endpoint
app.post('/api/analyze/animals', async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body as {
      imageBase64?: string;
      mimeType?: string;
    };
    if (!imageBase64) {
      return res.status(400).json({ error: 'Image or video frame payload is required.' });
    }

    const ai = getGeminiClient();
    const response = await generateContentWithRetry(ai, {
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: stripDataUrlPrefix(imageBase64),
            },
          },
          {
            text:
              'Detect ALL animals visible in this image or video frame. Distinguish between different species accurately. ' +
              'For each animal, determine its biological dietType ("carnivore", "herbivore", or "omnivore") and set isCarnivore to true ONLY for carnivorous animals (predators/meat-eaters such as lion, tiger, cheetah, leopard, wolf, fox, crocodile, eagle, hawk, shark, snake, cat, etc.). ' +
              'Provide tight bounding box coordinates [ymin, xmin, ymax, xmax] scaled from 0 to 1000.',
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            animals: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  species: { type: Type.STRING },
                  dietType: { type: Type.STRING },
                  isCarnivore: { type: Type.BOOLEAN },
                  confidence: { type: Type.NUMBER },
                  box_2d: {
                    type: Type.ARRAY,
                    items: { type: Type.INTEGER },
                  },
                },
                required: ['species', 'dietType', 'isCarnivore', 'confidence', 'box_2d'],
              },
            },
            summary: { type: Type.STRING },
          },
          required: ['animals', 'summary'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    const animals = Array.isArray(parsed.animals)
      ? parsed.animals.map((a: Record<string, unknown>, idx: number) => {
          const dietRaw = String(a.dietType || 'herbivore').toLowerCase();
          const dietType =
            dietRaw === 'carnivore' || dietRaw === 'omnivore' ? dietRaw : 'herbivore';
          const isCarnivore = Boolean(a.isCarnivore) || dietType === 'carnivore';
          return {
            id: `animal-${idx + 1}`,
            species: String(a.species || 'Unknown Animal'),
            dietType,
            isCarnivore,
            confidence: Number(a.confidence ?? 0.9),
            box_2d: clampBox(a.box_2d),
          };
        })
      : [];

    const carnivores = animals.filter((a: { isCarnivore: boolean }) => a.isCarnivore);
    const carnivoreSpecies = Array.from(
      new Set(carnivores.map((c: { species: string }) => c.species)),
    );

    return res.json({
      animals,
      totalAnimals: animals.length,
      carnivoreCount: carnivores.length,
      carnivoreSpecies,
      summary: String(
        parsed.summary ||
          `Detected ${animals.length} animal(s), including ${carnivores.length} carnivorous animal(s).`,
      ),
    });
  } catch (error) {
    return handleApiError(res, error, 'animals');
  }
});

// 3. Emotion Detection through Voice Endpoint (Female Voice Exclusive)
app.post('/api/analyze/voice-emotion', async (req: Request, res: Response) => {
  try {
    const { audioBase64, mimeType = 'audio/webm' } = req.body as {
      audioBase64?: string;
      mimeType?: string;
    };
    if (!audioBase64) {
      return res.status(400).json({ error: 'Audio payload is required.' });
    }

    const ai = getGeminiClient();
    const response = await generateContentWithRetry(ai, {
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: stripDataUrlPrefix(audioBase64),
            },
          },
          {
            text:
              'Listen carefully to this voice audio clip. ' +
              'First, determine if clear human speech is present (hasSpeech). ' +
              'Second, classify the speaker\'s vocal gender strictly as "female", "male", "uncertain", or "no_speech". Set isFemaleVoice to true ONLY if the speaker clearly has a female voice. ' +
              'Remember: this emotion detection model is designed to work EXCLUSIVELY with female voices. ' +
              'If isFemaleVoice is true, identify the speaker\'s primary emotion (e.g., "Happy", "Sad", "Angry", "Neutral", "Excited", "Fearful", "Surprised", "Calm"), transcribe what was said, and list 2-4 vocal/acoustic cues (pitch, cadence, energy, tone). ' +
              'If isFemaleVoice is false, leave emotion null and provide a clear rejectionReason asking the user to upload or record a female voice instead.',
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hasSpeech: { type: Type.BOOLEAN },
            detectedGender: { type: Type.STRING },
            isFemaleVoice: { type: Type.BOOLEAN },
            emotion: { type: Type.STRING, nullable: true },
            confidence: { type: Type.NUMBER },
            transcript: { type: Type.STRING },
            acousticCues: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            rejectionReason: { type: Type.STRING, nullable: true },
          },
          required: [
            'hasSpeech',
            'detectedGender',
            'isFemaleVoice',
            'confidence',
            'transcript',
            'acousticCues',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    const hasSpeech = Boolean(parsed.hasSpeech);
    const detectedGenderRaw = String(parsed.detectedGender || 'uncertain').toLowerCase();
    const detectedGender =
      detectedGenderRaw === 'female' ||
      detectedGenderRaw === 'male' ||
      detectedGenderRaw === 'no_speech'
        ? detectedGenderRaw
        : 'uncertain';
    const isFemaleVoice = hasSpeech && detectedGender === 'female' && Boolean(parsed.isFemaleVoice);

    if (!isFemaleVoice) {
      return res.json({
        hasSpeech,
        detectedGender,
        isFemaleVoice: false,
        emotion: null,
        confidence: Number(parsed.confidence ?? 0.85),
        transcript: String(parsed.transcript || ''),
        acousticCues: Array.isArray(parsed.acousticCues) ? parsed.acousticCues.map(String) : [],
        rejectionReason:
          String(
            parsed.rejectionReason ||
              (hasSpeech
                ? 'Non-female voice detected. This model operates exclusively on female voices — please upload or record a female voice note instead.'
                : 'No clear female speech detected in the audio. Please upload or record a clear female voice note.'),
          ),
      });
    }

    return res.json({
      hasSpeech: true,
      detectedGender: 'female',
      isFemaleVoice: true,
      emotion: String(parsed.emotion || 'Neutral'),
      confidence: Number(parsed.confidence ?? 0.9),
      transcript: String(parsed.transcript || ''),
      acousticCues: Array.isArray(parsed.acousticCues) ? parsed.acousticCues.map(String) : [],
      rejectionReason: null,
    });
  } catch (error) {
    return handleApiError(res, error, 'voice-emotion');
  }
});

// 4. Nationality Detection Endpoint (Strict Conditional Attribute Rules)
app.post('/api/analyze/nationality', async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body as {
      imageBase64?: string;
      mimeType?: string;
    };
    if (!imageBase64) {
      return res.status(400).json({ error: 'Portrait image payload is required.' });
    }

    const ai = getGeminiClient();
    const response = await generateContentWithRetry(ai, {
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: stripDataUrlPrefix(imageBase64),
            },
          },
          {
            text:
              'Analyze the primary person in this portrait image. ' +
              '1) Determine if a person is clearly visible (personDetected). ' +
              '2) Estimate the most likely nationality category among exactly these four options for nationalityGroup: "Indian", "United States", "African", or "Other". Also provide specificNationality (e.g., "Indian", "United States", "Nigerian / African", "Japanese", "British", etc.). ' +
              '3) Predict their facial emotion (e.g., "Happy", "Neutral", "Serious", "Surprised", "Calm", "Sad"). ' +
              '4) Estimate their age as an integer (estimatedAge). ' +
              '5) Identify their primary dress/clothing colour (dressColor, e.g., "Royal Blue", "White", "Emerald Green"). ' +
              '6) Provide the person\'s face/upper-body bounding box [ymin, xmin, ymax, xmax] scaled 0 to 1000.',
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            personDetected: { type: Type.BOOLEAN },
            nationalityGroup: { type: Type.STRING },
            specificNationality: { type: Type.STRING },
            emotion: { type: Type.STRING },
            estimatedAge: { type: Type.INTEGER },
            dressColor: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            box_2d: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
            },
            notes: { type: Type.STRING },
          },
          required: [
            'personDetected',
            'nationalityGroup',
            'specificNationality',
            'emotion',
            'estimatedAge',
            'dressColor',
            'confidence',
            'notes',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    const rawGroup = String(parsed.nationalityGroup || 'Other');
    const normalizedLower = rawGroup.toLowerCase();

    let nationalityGroup: 'Indian' | 'United States' | 'African' | 'Other' = 'Other';
    if (normalizedLower.includes('india')) {
      nationalityGroup = 'Indian';
    } else if (
      normalizedLower.includes('united states') ||
      normalizedLower === 'us' ||
      normalizedLower === 'usa' ||
      normalizedLower.includes('american')
    ) {
      nationalityGroup = 'United States';
    } else if (normalizedLower.includes('africa')) {
      nationalityGroup = 'African';
    }

    const rawAge = Number.isFinite(Number(parsed.estimatedAge))
      ? Math.max(1, Math.min(110, Math.round(Number(parsed.estimatedAge))))
      : null;
    const rawDress = parsed.dressColor ? String(parsed.dressColor) : null;

    // Enforce exact prompt conditional rules:
    // Indian -> Age + Dress Colour + Emotion
    // United States -> Only Age + Emotion
    // African -> Only Emotion + Dress Colour
    // Other -> Only Nationality + Emotion
    let age: number | null = null;
    let dressColor: string | null = null;
    let displayedNationality = String(parsed.specificNationality || nationalityGroup);

    if (nationalityGroup === 'Indian') {
      displayedNationality = 'Indian';
      age = rawAge;
      dressColor = rawDress;
    } else if (nationalityGroup === 'United States') {
      displayedNationality = 'United States';
      age = rawAge;
      dressColor = null;
    } else if (nationalityGroup === 'African') {
      displayedNationality = 'African';
      age = null;
      dressColor = rawDress;
    } else {
      age = null;
      dressColor = null;
    }

    return res.json({
      personDetected: Boolean(parsed.personDetected ?? true),
      nationalityGroup,
      displayedNationality,
      emotion: String(parsed.emotion || 'Neutral'),
      age,
      dressColor,
      confidence: Number(parsed.confidence ?? 0.88),
      box_2d: parsed.box_2d ? clampBox(parsed.box_2d) : undefined,
      notes: String(parsed.notes || ''),
    });
  } catch (error) {
    return handleApiError(res, error, 'nationality');
  }
});

// 5. Sign Language Detection Endpoint (Operational 6 PM - 10 PM)
app.post('/api/analyze/sign-language', async (req: Request, res: Response) => {
  try {
    const {
      imageBase64,
      mimeType = 'image/jpeg',
      clientHour,
      overrideWindow = false,
    } = req.body as {
      imageBase64?: string;
      mimeType?: string;
      clientHour?: number;
      overrideWindow?: boolean;
    };

    const effectiveHour =
      typeof clientHour === 'number' && clientHour >= 0 && clientHour <= 23
        ? clientHour
        : new Date().getHours();
    const isOperationalWindow = effectiveHour >= 18 && effectiveHour < 22;

    if (!isOperationalWindow && !overrideWindow) {
      return res.status(403).json({
        error:
          'Sign Language Detection is operational only between 6:00 PM and 10:00 PM (18:00–22:00).',
        operationalWindow: '18:00–22:00',
      });
    }

    if (!imageBase64) {
      return res.status(400).json({ error: 'Image or video frame payload is required.' });
    }

    const ai = getGeminiClient();
    const response = await generateContentWithRetry(ai, {
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: stripDataUrlPrefix(imageBase64),
            },
          },
          {
            text:
              'Analyze the hand sign or sign language gesture (ASL / common sign vocabulary) shown in this image or live camera frame. ' +
              'Known target vocabulary includes common words such as: Hello, Thank You, Yes, No, Please, Sorry, Help, I Love You, Stop, Good, Goodbye, Water, Eat, Friend, Okay, Peace, as well as ASL fingerspelling letters if shown. ' +
              'Set handDetected to true if a hand/sign gesture is visible, identify the recognizedWord, provide a concise gestureDescription explaining the hand shape and position, list up to 3 alternativeMatches, and return the bounding box [ymin, xmin, ymax, xmax] (0-1000) around the signing hand(s).',
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            handDetected: { type: Type.BOOLEAN },
            recognizedWord: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            gestureDescription: { type: Type.STRING },
            alternativeMatches: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            box_2d: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
            },
          },
          required: [
            'handDetected',
            'recognizedWord',
            'confidence',
            'gestureDescription',
            'alternativeMatches',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    return res.json({
      handDetected: Boolean(parsed.handDetected),
      recognizedWord: String(parsed.recognizedWord || 'No Sign Detected'),
      confidence: Number(parsed.confidence ?? 0.85),
      gestureDescription: String(parsed.gestureDescription || ''),
      alternativeMatches: Array.isArray(parsed.alternativeMatches)
        ? parsed.alternativeMatches.map(String)
        : [],
      box_2d: parsed.box_2d ? clampBox(parsed.box_2d) : undefined,
    });
  } catch (error) {
    return handleApiError(res, error, 'sign-language');
  }
});

// 6. Drowsiness Detection Endpoint
app.post('/api/analyze/drowsiness', async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body as {
      imageBase64?: string;
      mimeType?: string;
    };
    if (!imageBase64) {
      return res.status(400).json({ error: 'Vehicle cabin image or video frame payload is required.' });
    }

    const ai = getGeminiClient();
    const response = await generateContentWithRetry(ai, {
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: stripDataUrlPrefix(imageBase64),
            },
          },
          {
            text:
              'Analyze all people inside this vehicle cabin image or video frame. Detect EVERY person present (driver and passengers). ' +
              'For each person: 1) identify role ("driver" or "passenger"), 2) determine whether they are "sleeping" (eyes closed, head drooping/tilted back or sideways, slumped asleep) or "awake" (eyes open, alert), ' +
              '3) set isSleeping to true if sleeping, false if awake, 4) estimate their age as an integer (estimatedAge), 5) describe visualIndicators (e.g., "Eyes closed, head tilted against headrest"), and 6) return tight bounding box coordinates [ymin, xmin, ymax, xmax] scaled 0 to 1000.',
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            occupants: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  role: { type: Type.STRING },
                  state: { type: Type.STRING },
                  isSleeping: { type: Type.BOOLEAN },
                  estimatedAge: { type: Type.INTEGER },
                  confidence: { type: Type.NUMBER },
                  visualIndicators: { type: Type.STRING },
                  box_2d: {
                    type: Type.ARRAY,
                    items: { type: Type.INTEGER },
                  },
                },
                required: [
                  'role',
                  'state',
                  'isSleeping',
                  'estimatedAge',
                  'confidence',
                  'visualIndicators',
                  'box_2d',
                ],
              },
            },
            summary: { type: Type.STRING },
          },
          required: ['occupants', 'summary'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    const occupants = Array.isArray(parsed.occupants)
      ? parsed.occupants.map((o: Record<string, unknown>, idx: number) => {
          const isSleeping =
            Boolean(o.isSleeping) || String(o.state || '').toLowerCase() === 'sleeping';
          return {
            id: `occupant-${idx + 1}`,
            role: String(o.role || '').toLowerCase() === 'driver' ? 'driver' : 'passenger',
            state: isSleeping ? 'sleeping' : 'awake',
            isSleeping,
            estimatedAge: Math.max(1, Math.min(100, Math.round(Number(o.estimatedAge ?? 25)))),
            confidence: Number(o.confidence ?? 0.9),
            visualIndicators: String(o.visualIndicators || ''),
            box_2d: clampBox(o.box_2d),
          };
        })
      : [];

    const sleepingPeople = occupants.filter((o: { isSleeping: boolean }) => o.isSleeping);
    const sleepingAges = sleepingPeople.map((o: { estimatedAge: number }) => o.estimatedAge);

    return res.json({
      occupants,
      totalPeople: occupants.length,
      sleepingCount: sleepingPeople.length,
      awakeCount: occupants.length - sleepingPeople.length,
      sleepingAges,
      summary: String(
        parsed.summary ||
          `Detected ${occupants.length} person(s) in vehicle: ${sleepingPeople.length} sleeping, ${occupants.length - sleepingPeople.length} awake.`,
      ),
    });
  } catch (error) {
    return handleApiError(res, error, 'drowsiness');
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sightline Vision Suite running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
