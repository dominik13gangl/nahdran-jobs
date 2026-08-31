import { Heart, Search, Sparkles } from 'lucide-react'

type Props = { favorites: number; onShowFavorites: () => void; showingFavorites: boolean }

export function Header({ favorites, onShowFavorites, showingFavorites }: Props) {
  return (
    <header className="topbar">
      <a className="brand" href="#top" aria-label="Nahdran Startseite">Nahdran</a>
      <nav className="main-nav" aria-label="Hauptnavigation">
        <a className={!showingFavorites ? 'active' : ''} href="#jobs"><Search size={18} /> Jobs finden</a>
        <button className={showingFavorites ? 'active' : ''} onClick={onShowFavorites}>
          <Heart size={18} fill={showingFavorites ? 'currentColor' : 'none'} /> Favoriten
          {favorites > 0 && <span className="nav-count">{favorites}</span>}
        </button>
      </nav>
      <div className="topbar-note"><Sparkles size={17} /> Jeden Morgen frisch</div>
    </header>
  )
}
