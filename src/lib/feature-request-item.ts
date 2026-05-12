export type FeatureRequestItem = {
  id: number;
  user_email: string;
  message: string;
  screenshots: Array<{ name: string; mimeType: string; dataUrl: string }>;
  status: string;
  created_at: string;
};
