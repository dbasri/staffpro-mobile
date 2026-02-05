export interface UserSession {
  status: 'success' | 'fail';
  email: string;
  name: string | boolean;
  session: string;
  purpose: string;
}
