import { redirect } from 'next/navigation';

export default function RootPage() {
  // Simple redirect to login
  redirect('/login');
}
