export interface EnvVarDefinition {
  name: string;
  required: boolean;
  description: string;
  defaultValue?: string;
  validate?: (value: string) => boolean;
  validationMessage?: string;
}

export const envVarDefinitions: EnvVarDefinition[] = [
  {
    name: "INTERNAL_SERVICE_SECRET",
    required: true,
    description: "Internal service secret key",
    validationMessage: "INTERNAL_SERVICE_SECRET is missing or invalid.",
  },
  {
    name: "PORT",
    required: false,
    description: "Server port number",
    defaultValue: "4001",
    validate: (value) => {
      const port = Number.parseInt(value, 10);
      return !Number.isNaN(port) && port > 0 && port <= 65535;
    },
    validationMessage: "PORT is missing or invalid.",
  },
  {
    name: "NODE_ENV",
    required: false,
    description: "Node environment",
    defaultValue: "development",
    validate: (value) => ["development", "production", "test"].includes(value),
    validationMessage: "NODE_ENV is missing or invalid.",
  },
  {
    name: "MONGO_URI",
    required: true,
    description: "MongoDB connection URI",
    validate: (value) => {
      return (
        value.startsWith("mongodb://") || value.startsWith("mongodb+srv://")
      );
    },
    validationMessage: "MONGO_URI is missing or invalid.",
  },
  {
    name: "FRONTEND_URL",
    required: true,
    description: "Frontend application URL",
    validate: (value) => {
      try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol);
      } catch {
        return false;
      }
    },
    validationMessage: "FRONTEND_URL is missing or invalid.",
  },
  {
    name: "AUTH_SERVICE_URL",
    required: true,
    description: "Auth service URL",
    validate: (value) => {
      try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol);
      } catch {
        return false;
      }
    },
    validationMessage: "AUTH_SERVICE_URL is missing or invalid.",
  },
  {
    name: "BILLING_SERVICE_URL",
    required: true,
    description: "Billing service URL",
    validate: (value) => {
      try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol);
      } catch {
        return false;
      }
    },
    validationMessage: "BILLING_SERVICE_URL is missing or invalid.",
  },
  {
    name: "CATEGORIES_SERVICE_URL",
    required: true,
    description: "Category service URL",
    validate: (value) => {
      try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol);
      } catch {
        return false;
      }
    },
    validationMessage: "CATEGORIES_SERVICE_URL is missing or invalid.",
  },
  {
    name: "FILE_SERVICE_URL",
    required: true,
    description: "Files service URL",
    validate: (value) => {
      try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol);
      } catch {
        return false;
      }
    },
    validationMessage: "FILE_SERVICE_URL is missing or invalid.",
  },
  {
    name: "SIGHTENGINE_API_USER",
    required: true,
    description: "Sightengine API user",
    validationMessage: "SIGHTENGINE_API_USER is missing or invalid.",
  },
  {
    name: "SIGHTENGINE_API_SECRET",
    required: true,
    description: "Sightengine API secret",
    validationMessage: "SIGHTENGINE_API_SECRET is missing or invalid.",
  },
  {
    name: "R2_IMAGE_PUBLIC_URL",
    required: true,
    description: "R2 image public URL",
    validationMessage: "R2_IMAGE_PUBLIC_URL is missing or invalid.",
  },
];

export function validateEnv(): void {
  const errors: string[] = [];

  for (const envVar of envVarDefinitions) {
    const value = process.env[envVar.name];
    const isRequired = envVar.required;

    if (isRequired && !value) {
      errors.push(
        `Missing required environment variable: ${envVar.name}\n` +
          `   Description: ${envVar.description}\n` +
          `   Action: Set ${envVar.name} in your .env file or environment`,
      );
      continue;
    }

    if (!value && envVar.defaultValue) {
      continue;
    }

    if (value && envVar.validate) {
      if (!envVar.validate(value)) {
        const message =
          envVar.validationMessage || `${envVar.name} has an invalid value`;
        errors.push(
          `Invalid value for ${envVar.name}: ${value}\n` +
            `   ${message}\n` +
            `   Description: ${envVar.description}`,
        );
        continue;
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Environment validation failed: ${errors.length} error(s) found. See above for details.`,
    );
  }

  console.log("\n✅ All environment variables validated successfully!\n");
}
