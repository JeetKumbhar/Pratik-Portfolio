import { Compass } from 'lucide-react';
import EmptyState from '../../components/common/EmptyState';
import Button from '../../components/common/Button';

export default function NotFound() {
  return (
    <div className="container" style={{ padding: '80px 24px' }}>
      <EmptyState
        icon={<Compass size={28} />}
        title="Page not found"
        message="The page you're looking for doesn't exist or has moved."
        action={<Button to="/">Back to home</Button>}
      />
    </div>
  );
}
