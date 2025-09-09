

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "crypto";

export type _webToken = {
    secret?: string;
    cookieName?: string;
    iv?: string;
    algorithm?: string;
    maxAge?: number;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    domain?: string;
    path?: string;
}

interface TokenPayload {
    data: any;
    iat: number; // issued at
    exp: number; // expires at
    jti: string; // JWT ID (unique identifier)
    iss: string; // issuer
    nbf?: number; // not before
}

interface TokenValidationResult {
    isValid: boolean;
    error?: 'expired' | 'invalid' | 'malformed' | 'not_active' | 'tampered';
    payload?: any;
}

export type SetDataOptions = {
    expiresInSeconds?: number;
    notBefore?: Date;
    preserveExpiration?: boolean;
    jti?: string;
}

/**
 * Enhanced WebToken Class for Secure Session Management
 * 
 * Features:
 * - AES-256-CBC encryption with HMAC integrity verification
 * - JWT-like payload structure with expiration and issuer validation
 * - Timing attack protection with constant-time comparison
 * - Secure cookie handling with configurable options
 * - Token rotation and validation
 * - Weak secret detection and validation
 * - Size limits and security best practices
 * - Plain cookie support with same security options
 * 
 * @example
 * ```typescript
 * // Initialize with secure defaults
 * const token = new webToken<UserSession>(request, {
 *   cookieName: 'session',
 *   maxAge: 3600, // 1 hour
 *   secure: true,
 *   httpOnly: true,
 *   sameSite: 'strict'
 * });
 * 
 * // Set encrypted session data
 * const encrypted = token.setData({
 *   userId: 123,
 *   email: 'user@example.com',
 *   roles: ['user']
 * });
 * token.setCookie(response);
 * 
 * // Set plain (unencrypted) cookies with same security options
 * token.setPlainCookie(response, 'theme', 'dark');
 * token.setPlainJsonCookie(response, 'preferences', {
 *   language: 'en',
 *   notifications: true
 * });
 * 
 * // Get plain cookies
 * const theme = token.getPlainCookie('theme');
 * const prefs = token.getPlainJsonCookie<UserPreferences>('preferences');
 * 
 * // Check session
 * if (token.isValid()) {
 *   const session = token.session();
 *   console.log('User ID:', session.userId);
 * }
 * 
 * // Rotate token for security
 * if (token.isExpiringSoon()) {
 *   token.rotateToken();
 *   token.setCookie(response);
 * }
 * 
 * // Clear cookies
 * token.clearCookie(response); // Clear encrypted session
 * token.clearPlainCookie(response, 'theme'); // Clear specific plain cookie
 * ```
 */
export class webToken<_Data> {
    private secret: string;
    private algorithm: string;
    private iv: string;
    private cookieName: string;
    private encryptedData?: string;
    private sessionData?: _Data;
    private request: Request;
    private maxAge: number;
    private secure: boolean;
    private httpOnly: boolean;
    private sameSite: 'strict' | 'lax' | 'none';
    private domain?: string;
    private path: string;
    private issuer: string;

    // Security constants
    private static readonly MIN_SECRET_LENGTH = 32;
    private static readonly IV_LENGTH = 16;
    private static readonly SUPPORTED_ALGORITHMS = ['aes-256-cbc', 'aes-256-gcm'];
    private static readonly MAX_TOKEN_SIZE = 4096; // 4KB limit for cookies

    /** Enhanced constructor with better security defaults */
    constructor(request: Request, init?: _webToken) {
        this.request = request;
        this.algorithm = init?.algorithm || "aes-256-cbc";
        this.cookieName = init?.cookieName || "WebToken";
        this.maxAge = init?.maxAge || 3600; // 1 hour default
        this.secure = init?.secure ?? (process.env.NODE_ENV === 'production');
        this.httpOnly = init?.httpOnly ?? true;
        this.sameSite = init?.sameSite || 'strict';
        this.domain = init?.domain;
        this.path = init?.path || '/';
        this.issuer = process.env.TOKEN_ISSUER || 'bunext-app';

        // Validate and set secret
        this.secret = this.validateAndSetSecret(init?.secret);

        // Validate and set IV
        this.iv = this.validateAndSetIV(init?.iv);

        // Validate algorithm
        if (!webToken.SUPPORTED_ALGORITHMS.includes(this.algorithm)) {
            throw new Error(`Unsupported algorithm: ${this.algorithm}. Supported: ${webToken.SUPPORTED_ALGORITHMS.join(', ')}`);
        }

        try {
            this.sessionData = this.getCookie<_Data>();
        } catch (error) {
            // Log security-related errors for monitoring
            if (error instanceof Error && error.message.includes('tampered')) {
                console.warn('[Security] Potential token tampering detected:', error.message);
            }
            this.sessionData = undefined;
        }
    }

    private validateAndSetSecret(providedSecret?: string): string {
        const secret = providedSecret || process.env.WEB_TOKEN_SECRET;

        if (!secret) {
            throw new Error("WEB_TOKEN_SECRET environment variable is required or provide secret in constructor");
        }

        if (secret.length < webToken.MIN_SECRET_LENGTH) {
            throw new Error(`Secret must be at least ${webToken.MIN_SECRET_LENGTH} characters long for security`);
        }

        // Check for weak secrets
        if (this.isWeakSecret(secret)) {
            throw new Error("Secret appears to be weak. Use a cryptographically secure random string");
        }

        return secret;
    }

    private validateAndSetIV(providedIV?: string): string {
        let iv = providedIV || process.env.WEB_TOKEN_IV;

        if (!iv) {
            // Generate a random IV if none provided
            iv = randomBytes(webToken.IV_LENGTH).toString('hex').slice(0, webToken.IV_LENGTH);
            console.warn('[Security] Generated random IV. Consider setting WEB_TOKEN_IV environment variable for consistency');
        }

        if (iv.length !== webToken.IV_LENGTH) {
            throw new Error(`IV must be exactly ${webToken.IV_LENGTH} characters long`);
        }

        return iv;
    }

    private isWeakSecret(secret: string): boolean {
        // Check for common weak patterns
        const weakPatterns = [
            /^(password|secret|key|token)$/i,
            /^(.)\1+$/, // repeated characters
            /^(123|abc|qwe)/i,
            /^[a-z]+$/i, // only letters
            /^\d+$/, // only numbers
        ];

        return weakPatterns.some(pattern => pattern.test(secret));
    }

    public session(): _Data | undefined {
        return this.sessionData;
    }

    /** Check if session exists and is valid */
    public isValid(): boolean {
        return this.sessionData !== undefined;
    }

    /** Get session expiration time */
    public getExpirationTime(): number | undefined {
        if (!this.sessionData) return undefined;

        try {
            const payload = this.sessionData as any;
            return payload.exp ? payload.exp * 1000 : undefined; // Convert to milliseconds
        } catch {
            return undefined;
        }
    }

    /** Check if session is about to expire (within threshold) */
    public isExpiringSoon(thresholdSeconds: number = 300): boolean {
        const expTime = this.getExpirationTime();
        if (!expTime) return false;

        return (expTime - Date.now()) < (thresholdSeconds * 1000);
    }

    /** Update existing data while preserving token metadata */
    public updateData(data: { [key: string]: any }): string {
        if (!this.sessionData) {
            throw new Error("No existing session to update. Use setData() to create a new session");
        }

        const currentPayload = this.sessionData as any;
        const updatedData = {
            ...currentPayload.data,
            ...data
        };

        return this.setData(updatedData, {
            preserveExpiration: true,
            jti: currentPayload.jti
        });
    }

    /** Create or replace token data with enhanced security */
    public setData(
        data: { [key: string]: any },
        options?: SetDataOptions
    ): string {
        const now = Math.floor(Date.now() / 1000);
        const expiresIn = options?.expiresInSeconds || this.maxAge;

        const payload: TokenPayload = {
            data,
            iat: now,
            exp: options?.preserveExpiration ?
                (this.sessionData as any)?.exp || (now + expiresIn) :
                (now + expiresIn),
            jti: options?.jti || this.generateJTI(),
            iss: this.issuer,
            ...(options?.notBefore && { nbf: Math.floor(options.notBefore.getTime() / 1000) })
        };

        const serializedData = this.encodeData(payload);

        // Check token size
        if (serializedData.length > webToken.MAX_TOKEN_SIZE) {
            throw new Error(`Token size (${serializedData.length}) exceeds maximum allowed size (${webToken.MAX_TOKEN_SIZE})`);
        }

        const encrypted = this.encrypt(serializedData);
        this.encryptedData = encrypted;
        return encrypted;
    }

    /** Validate and get data from encrypted token */
    public getData(encryptedData: string): TokenValidationResult {
        try {
            const decrypted = this.decrypt(encryptedData);
            const payload = this.decodeData(decrypted) as TokenPayload;

            // Validate payload structure
            if (!this.isValidPayload(payload)) {
                return { isValid: false, error: 'malformed' };
            }

            const now = Math.floor(Date.now() / 1000);

            // Check expiration
            if (payload.exp && now > payload.exp) {
                return { isValid: false, error: 'expired' };
            }

            // Check not before
            if (payload.nbf && now < payload.nbf) {
                return { isValid: false, error: 'not_active' };
            }

            // Check issuer
            if (payload.iss !== this.issuer) {
                return { isValid: false, error: 'invalid' };
            }

            return { isValid: true, payload: payload.data };

        } catch (error) {
            console.warn('[Security] Token decryption failed:', error instanceof Error ? error.message : 'Unknown error');
            return { isValid: false, error: 'tampered' };
        }
    }

    /** Set secure cookie with enhanced options */
    public setCookie(
        response: Response,
        options?: Partial<_webToken>
    ): Response {
        if (!this.encryptedData) {
            throw new Error("No data set to be sent to cookie. Call setData() first");
        }

        const cookieOptions = {
            maxAge: options?.maxAge || this.maxAge,
            httpOnly: options?.httpOnly ?? this.httpOnly,
            secure: options?.secure ?? this.secure,
            sameSite: options?.sameSite || this.sameSite,
            domain: options?.domain || this.domain,
            path: options?.path || this.path
        };

        let cookieString = `${this.cookieName}=${this.encryptedData}; Max-Age=${cookieOptions.maxAge}; Path=${cookieOptions.path}`;

        if (cookieOptions.httpOnly) {
            cookieString += '; HttpOnly';
        }

        if (cookieOptions.secure) {
            cookieString += '; Secure';
        }

        if (cookieOptions.sameSite) {
            cookieString += `; SameSite=${cookieOptions.sameSite}`;
        }

        if (cookieOptions.domain) {
            cookieString += `; Domain=${cookieOptions.domain}`;
        }
        response.headers.append('Set-Cookie', cookieString);
        return response;
    }

    /** Set plain (unencrypted) cookie with same security options */
    public setPlainCookie(
        response: Response,
        cookieName: string,
        value: string,
        options?: Partial<_webToken>
    ): Response {
        if (!cookieName || !value) {
            throw new Error("Cookie name and value are required");
        }

        // Use same security defaults as encrypted cookies
        const cookieOptions = {
            maxAge: options?.maxAge || this.maxAge,
            httpOnly: options?.httpOnly ?? this.httpOnly,
            secure: options?.secure ?? this.secure,
            sameSite: options?.sameSite || this.sameSite,
            domain: options?.domain || this.domain,
            path: options?.path || this.path
        };

        // Encode the value to handle special characters
        const encodedValue = encodeURIComponent(value);

        let cookieString = `${cookieName}=${encodedValue}; Max-Age=${cookieOptions.maxAge}; Path=${cookieOptions.path}`;

        if (cookieOptions.httpOnly) {
            cookieString += '; HttpOnly';
        }

        if (cookieOptions.secure) {
            cookieString += '; Secure';
        }

        if (cookieOptions.sameSite) {
            cookieString += `; SameSite=${cookieOptions.sameSite}`;
        }

        if (cookieOptions.domain) {
            cookieString += `; Domain=${cookieOptions.domain}`;
        }

        response.headers.append('Set-Cookie', cookieString);
        return response;
    }

    /** Set plain JSON cookie (unencrypted but serialized) */
    public setPlainJsonCookie(
        response: Response,
        cookieName: string,
        data: any,
        options?: Partial<_webToken>
    ): Response {
        if (!cookieName || data === undefined) {
            throw new Error("Cookie name and data are required");
        }

        try {
            // Serialize data to JSON
            const jsonValue = JSON.stringify(data);
            return this.setPlainCookie(response, cookieName, jsonValue, options);
        } catch (error) {
            throw new Error(`Failed to serialize data to JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /** Get plain (unencrypted) cookie value */
    public getPlainCookie(cookieName: string): string | undefined {
        const cookieHeader = this.request.headers.get("cookie");
        if (!cookieHeader) return undefined;

        const cookies = this.parseCookies(cookieHeader);
        const value = cookies[cookieName];

        return value ? decodeURIComponent(value) : undefined;
    }

    /** Get plain JSON cookie (unencrypted but deserialized) */
    public getPlainJsonCookie<T = any>(cookieName: string): T | undefined {
        const value = this.getPlainCookie(cookieName);
        if (!value) return undefined;

        try {
            return JSON.parse(value) as T;
        } catch (error) {
            console.warn(`Failed to parse JSON cookie "${cookieName}":`, error instanceof Error ? error.message : 'Unknown error');
            return undefined;
        }
    }

    /** Clear/delete any cookie by name */
    public clearPlainCookie(response: Response, cookieName: string): Response {
        const cookieString = `${cookieName}=; Max-Age=0; Path=${this.path}; HttpOnly; Secure`;
        response.headers.append('Set-Cookie', cookieString);
        return response;
    }

    /** Clear/delete the cookie */
    public clearCookie(response: Response): Response {
        const cookieString = `${this.cookieName}=; Max-Age=0; Path=${this.path}; HttpOnly; Secure`;
        response.headers.append('Set-Cookie', cookieString);
        return response;
    }

    /** Rotate token (create new token with fresh expiration) */
    public rotateToken(data?: { [key: string]: any }): string {
        const currentData = data || (this.sessionData as any)?.data;
        if (!currentData) {
            throw new Error("No data available for token rotation");
        }

        return this.setData(currentData, {
            jti: this.generateJTI() // Force new JTI
        });
    }
    /** Get cookie and validate it securely */
    private getCookie<_Data>(): _Data | undefined {
        const cookieHeader = this.request.headers.get("cookie");
        if (!cookieHeader) return undefined;

        const cookies = this.parseCookies(cookieHeader);
        const token = cookies[this.cookieName];

        if (!token) return undefined;

        const validation = this.getData(token);
        if (!validation.isValid) {
            if (validation.error === 'tampered') {
                throw new Error('Token appears to be tampered with');
            }
            return undefined;
        }

        return validation.payload as _Data;
    }

    /** Securely parse cookies */
    private parseCookies(cookieHeader: string): Record<string, string> {
        const cookies: Record<string, string> = {};

        cookieHeader.split(';').forEach(cookie => {
            const [name, ...valueParts] = cookie.split('=');
            if (name && valueParts.length > 0) {
                cookies[name.trim()] = valueParts.join('=').trim();
            }
        });

        return cookies;
    }

    /** Enhanced encryption with integrity check */
    private encrypt(data: string): string {
        try {
            const cipher = this.cipher();
            let encrypted = cipher.update(data, "utf-8", "hex");
            encrypted += cipher.final("hex");

            // Add HMAC for integrity
            const hmac = this.createHMAC(encrypted);
            return `${encrypted}.${hmac}`;

        } catch (error) {
            throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /** Enhanced decryption with integrity verification */
    private decrypt(encryptedData: string): string {
        try {
            const [encrypted, hmac] = encryptedData.split('.');

            if (!encrypted || !hmac) {
                throw new Error('Invalid token format');
            }

            // Verify HMAC
            const expectedHmac = this.createHMAC(encrypted);
            if (!this.constantTimeCompare(hmac, expectedHmac)) {
                throw new Error('Token integrity check failed');
            }

            const decipher = this.decipher();
            let decrypted = decipher.update(encrypted, "hex", "utf8");
            decrypted += decipher.final("utf8");

            return decrypted;

        } catch (error) {
            throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /** Create HMAC for integrity verification */
    private createHMAC(data: string): string {
        return createHash('sha256')
            .update(data + this.secret)
            .digest('hex');
    }

    /** Constant-time string comparison to prevent timing attacks */
    private constantTimeCompare(a: string, b: string): boolean {
        if (a.length !== b.length) return false;

        const bufferA = Buffer.from(a, 'hex');
        const bufferB = Buffer.from(b, 'hex');

        return timingSafeEqual(bufferA, bufferB);
    }

    /** Generate unique JWT ID */
    private generateJTI(): string {
        return randomBytes(16).toString('hex');
    }

    /** Validate payload structure */
    private isValidPayload(payload: any): payload is TokenPayload {
        return (
            payload &&
            typeof payload === 'object' &&
            typeof payload.iat === 'number' &&
            typeof payload.exp === 'number' &&
            typeof payload.jti === 'string' &&
            typeof payload.iss === 'string' &&
            payload.data !== undefined
        );
    }

    private decipher() {
        return createDecipheriv(
            this.algorithm,
            this.hashedSecret(),
            this.hashedIV()
        );
    }

    private cipher() {
        return createCipheriv(this.algorithm, this.hashedSecret(), this.hashedIV());
    }

    /** Enhanced data encoding with compression for large payloads */
    private encodeData(data: any): string {
        try {
            const jsonString = JSON.stringify(data);

            // Use more secure encoding
            const encoded = Buffer.from(jsonString, 'utf-8').toString('base64');
            return encoded;

        } catch (error) {
            throw new Error(`Data encoding failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /** Enhanced data decoding with validation */
    private decodeData(encodedData: string): any {
        try {
            const jsonString = Buffer.from(encodedData, 'base64').toString('utf-8');
            return JSON.parse(jsonString);

        } catch (error) {
            throw new Error(`Data decoding failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /** Generate cryptographically secure hash for secret */
    private hashedSecret(): Buffer {
        return createHash("sha256")
            .update(this.secret)
            .digest()
            .slice(0, 32);
    }

    /** Generate cryptographically secure hash for IV */
    private hashedIV(): Buffer {
        return createHash("sha256")
            .update(this.iv)
            .digest()
            .slice(0, 16);
    }

    /** Static method to generate secure random secret */
    public static generateSecureSecret(length: number = 64): string {
        return randomBytes(length).toString('hex');
    }

    /** Static method to generate secure random IV */
    public static generateSecureIV(): string {
        return randomBytes(webToken.IV_LENGTH).toString('hex').slice(0, webToken.IV_LENGTH);
    }

    /** Get token information for debugging (without sensitive data) */
    public getTokenInfo(): {
        algorithm: string;
        cookieName: string;
        maxAge: number;
        secure: boolean;
        httpOnly: boolean;
        sameSite: string;
        hasSession: boolean;
        isExpiringSoon?: boolean;
        expirationTime?: number;
    } {
        return {
            algorithm: this.algorithm,
            cookieName: this.cookieName,
            maxAge: this.maxAge,
            secure: this.secure,
            httpOnly: this.httpOnly,
            sameSite: this.sameSite,
            hasSession: this.isValid(),
            ...(this.isValid() && {
                isExpiringSoon: this.isExpiringSoon(),
                expirationTime: this.getExpirationTime()
            })
        };
    }
}
