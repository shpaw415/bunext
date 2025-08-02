export const ExitCodeDescription = {
    3: { description: "Server closed due to a Reboot in development mode", code: 3 },
    2: { description: "Build failed", code: 2 },
    1: { description: "Runtime error occurred", code: 1 },
} as const;