export type CatalogSource = "huji_shnaton";

export interface CatalogMeeting {
  weekday: "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";
  startTime: string;
  endTime: string;
  meetingType?: string;
  location?: string;
  semester?: string;
}

export interface CatalogCourse {
  source: CatalogSource;
  externalId: string;
  courseNumber: string;
  nameHe?: string;
  nameEn?: string;
  faculty?: string;
  department?: string;
  credits?: number;
  meetings: CatalogMeeting[];
}

export interface CatalogSearchResult extends Omit<CatalogCourse, "meetings"> {
  meetingsCount: number;
  lastSeenAt?: string;
}
