import { Timestamp } from 'firebase/firestore';

export interface Governorate {
  id: string;
  name: string;
  active: boolean;
  order: number;
  createdAt: Timestamp;
}

export interface City {
  id: string;
  governorateId: string;
  name: string;
  active: boolean;
  order: number;
  createdAt: Timestamp;
}

export interface GovernorateWithCities extends Governorate {
  cities: City[];
}

export interface CitySelection {
  governorateId: string | null;
  governorateName: string | null;
  cityId: string | null;
  cityName: string | null;
  isWholeGovernorate: boolean;
}
