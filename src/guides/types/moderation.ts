export type ModerationFailure = {
  type: "image" | "video" | "pdf" | "text";
  label: string;
};

export type VisualModerationTarget = {
  url: string;
  label: string;
};
