import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import CoverImage from './CoverImage';

const fallback = <span data-testid="generated">poster</span>;

afterEach(cleanup);

describe('CoverImage', () => {
  it('walks the chain on errors and ends on the generated poster', () => {
    const { container } = render(
      <CoverImage
        sources={['https://r2.example.com/w320.webp', 'http://insecure.example.com/a.jpg', 'https://r2.example.com/w800.webp', 'https://venue.es/a.jpg']}
        fallback={fallback}
        className="cover"
      />,
    );
    const current = () => container.querySelector('img');
    expect(current()).toHaveAttribute('src', 'https://r2.example.com/w320.webp');
    expect(current()).toHaveAttribute('loading', 'lazy');
    expect(current()).toHaveAttribute('decoding', 'async');
    expect(current()).toHaveAttribute('data-own-fallback');

    fireEvent.error(current()!);
    // The http:// URL is never tried.
    expect(current()).toHaveAttribute('src', 'https://r2.example.com/w800.webp');
    fireEvent.error(current()!);
    expect(current()).toHaveAttribute('src', 'https://venue.es/a.jpg');
    fireEvent.error(current()!);
    expect(current()).toBeNull();
    expect(screen.getByTestId('generated')).toBeInTheDocument();
  });

  it('shows the fallback when there is nothing safe to load', () => {
    render(<CoverImage sources={[null, 'http://a.com/x.jpg', '']} fallback={fallback} />);
    expect(screen.getByTestId('generated')).toBeInTheDocument();
  });

  it('starts over when the sources change (a poster mirrored meanwhile)', () => {
    const { container, rerender } = render(<CoverImage sources={['https://a.com/1.jpg']} fallback={fallback} />);
    fireEvent.error(container.querySelector('img')!);
    expect(screen.getByTestId('generated')).toBeInTheDocument();
    rerender(<CoverImage sources={['https://r2.example.com/w320.webp', 'https://a.com/1.jpg']} fallback={fallback} />);
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://r2.example.com/w320.webp');
  });

  it('loads eagerly above the fold', () => {
    const { container } = render(<CoverImage sources={['https://a.com/1.jpg']} fallback={fallback} eager />);
    expect(container.querySelector('img')).toHaveAttribute('loading', 'eager');
  });
});
