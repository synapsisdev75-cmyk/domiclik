import { APP_STORE_URL, PLAY_STORE_URL } from '../lib/config';

type StoreBadgeProps = {
  href: string;
  label: string;
  imgSrc: string;
  imgAlt: string;
  imgClassName?: string;
};

function StoreBadge({ href, label, imgSrc, imgAlt, imgClassName }: StoreBadgeProps) {
  const ready = Boolean(href.trim());
  const className = `store-badge${ready ? '' : ' store-badge--soon'}`;

  const mark = (
    <span className="store-badge__mark">
      <img src={imgSrc} alt={imgAlt} className={imgClassName ?? 'store-badge__img'} draggable={false} />
    </span>
  );

  if (ready) {
    return (
      <a
        className={className}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
      >
        {mark}
      </a>
    );
  }

  return (
    <span className={className} role="img" aria-label={`${label} — Próximamente`}>
      {mark}
      <span className="store-badge__soon">Próximamente</span>
    </span>
  );
}

export function StoreBadges({ className = '' }: { className?: string }) {
  return (
    <div className={`store-badges ${className}`.trim()}>
      <StoreBadge
        href={PLAY_STORE_URL}
        label="Disponible en Google Play"
        imgSrc="/brand/stores/google-play-badge.png"
        imgAlt="Disponible en Google Play"
        imgClassName="store-badge__img store-badge__img--play"
      />
      <StoreBadge
        href={APP_STORE_URL}
        label="Descárgalo en el App Store"
        imgSrc="/brand/stores/app-store-badge.svg"
        imgAlt="Descárgalo en el App Store"
        imgClassName="store-badge__img store-badge__img--apple"
      />
    </div>
  );
}
