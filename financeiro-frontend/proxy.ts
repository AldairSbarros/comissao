import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  // Apenas deixamos a requisição passar por enquanto.
  // A proteção real está sendo feita no lado do cliente com o hook useAuth.
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};