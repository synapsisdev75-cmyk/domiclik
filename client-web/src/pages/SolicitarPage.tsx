import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { IngestOrderResponse } from '../contracts/salesIngest';
import { OrderForm } from '../components/OrderForm';
import { SuccessScreen } from '../components/SuccessScreen';

export function SolicitarPage() {
  const navigate = useNavigate();
  const [result, setResult] = useState<IngestOrderResponse | null>(null);

  if (result) {
    return (
      <div className="app-screen mx-auto max-w-lg px-4 pb-6 sm:px-6">
        <SuccessScreen
          result={result}
          onNewRequest={() => {
            setResult(null);
            navigate('/');
          }}
        />
      </div>
    );
  }

  return (
    <div className="app-screen mx-auto max-w-lg px-3 pb-4 sm:px-6">
      <OrderForm wizard onSuccess={setResult} />
    </div>
  );
}
