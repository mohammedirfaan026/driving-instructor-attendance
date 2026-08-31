export {}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(options: { client_id: string; scope: string; callback: (response: GoogleTokenResponse) => void; error_callback?: (error: { type?: string; message?: string }) => void }): GoogleTokenClient
          revoke(token: string, callback: (response: { successful: boolean }) => void): void
        }
      }
    }
  }
  interface GoogleTokenClient { requestAccessToken(options?: { prompt?: string }): void }
  interface GoogleTokenResponse { access_token?: string; expires_in?: number; error?: string; error_description?: string; scope?: string }
}
