export type ModuleId =
  | 'car-color'
  | 'animal-detection'
  | 'voice-emotion'
  | 'nationality'
  | 'sign-language'
  | 'drowsiness';

export type Box2D = [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0-1000

export interface BoundingBoxItem {
  id: string;
  label: string;
  sublabel?: string;
  color: 'red' | 'blue' | 'emerald' | 'amber' | 'slate';
  box_2d: Box2D;
}

export interface DetectedCar {
  id: string;
  color: string;
  isBlue: boolean;
  vehicleType: string;
  confidence: number;
  box_2d: Box2D;
}

export interface DetectedPerson {
  id: string;
  locationNote: string;
  box_2d: Box2D;
}

export interface CarColorResult {
  cars: DetectedCar[];
  people: DetectedPerson[];
  totalCars: number;
  blueCarsCount: number;
  otherCarsCount: number;
  peopleCount: number;
  summary: string;
}

export interface DetectedAnimal {
  id: string;
  species: string;
  dietType: 'carnivore' | 'herbivore' | 'omnivore';
  isCarnivore: boolean;
  confidence: number;
  box_2d: Box2D;
}

export interface AnimalDetectionResult {
  animals: DetectedAnimal[];
  totalAnimals: number;
  carnivoreCount: number;
  carnivoreSpecies: string[];
  summary: string;
}

export interface VoiceEmotionResult {
  hasSpeech: boolean;
  detectedGender: 'female' | 'male' | 'uncertain' | 'no_speech';
  isFemaleVoice: boolean;
  emotion: string | null;
  confidence: number;
  transcript: string;
  acousticCues: string[];
  rejectionReason: string | null;
}

export type NationalityGroup = 'Indian' | 'United States' | 'African' | 'Other';

export interface NationalityResult {
  personDetected: boolean;
  nationalityGroup: NationalityGroup;
  displayedNationality: string;
  emotion: string;
  age: number | null;
  dressColor: string | null;
  confidence: number;
  box_2d?: Box2D;
  notes: string;
}

export interface SignLanguageResult {
  handDetected: boolean;
  recognizedWord: string;
  confidence: number;
  gestureDescription: string;
  alternativeMatches: string[];
  box_2d?: Box2D;
}

export interface DetectedOccupant {
  id: string;
  role: 'driver' | 'passenger';
  state: 'sleeping' | 'awake';
  isSleeping: boolean;
  estimatedAge: number;
  confidence: number;
  visualIndicators: string;
  box_2d: Box2D;
}

export interface DrowsinessResult {
  occupants: DetectedOccupant[];
  totalPeople: number;
  sleepingCount: number;
  awakeCount: number;
  sleepingAges: number[];
  summary: string;
}

export interface AnalyzedVideoFrame<T> {
  timestamp: number;
  dataUrl: string;
  result: T;
}
