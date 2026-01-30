export interface UserSession {
  status: 'success' | 'fail';
  email: string;
  name: string;
  session: string;
  purpose: string;
}
