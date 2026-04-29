import { User, FeedCard, Swipe } from '@/types'

/** Build the set of user IDs to exclude from the feed.
 *  Passes expire after 30 days — that person reappears in the feed. */
export function buildSwipedSet(swipes: Pick<Swipe, 'to_user' | 'sentiment' | 'created_at'>[]): Set<string> {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  return new Set(
    swipes
      .filter(s => {
        if (s.sentiment === 'pass') return new Date(s.created_at).getTime() > thirtyDaysAgo
        return true // like/dislike/neutral/block are permanent
      })
      .map(s => s.to_user)
  )
}

/** Returns true if a wants to date b and b wants to date a. */
function mutuallyCompatible(a: User, b: User): boolean {
  function prefMatchesGender(prefs: string[] | string | null | undefined, gender: string | null | undefined): boolean {
    if (!prefs || !gender) return true
    const arr = Array.isArray(prefs) ? prefs : [prefs]
    if (arr.length === 0) return true
    return arr.some(p =>
      (p === 'Men' && gender === 'Man') ||
      (p === 'Women' && gender === 'Woman') ||
      (p === 'Non-binary' && gender === 'Non-binary')
    )
  }
  return prefMatchesGender(a.want_to_date, b.gender) && prefMatchesGender(b.want_to_date, a.gender)
}

/** Find shared Spotify artists and genres between two users. */
function spotifyOverlap(a: User, b: User): { artists: string[]; genres: string[] } {
  const sa = a.spotify_interests
  const sb = b.spotify_interests
  if (!sa || !sb) return { artists: [], genres: [] }

  const artistsA = new Set(sa.top_artists.map(x => x.toLowerCase()))
  const genresA  = new Set(sa.genres.map(x => x.toLowerCase()))

  const artists = sb.top_artists.filter(x => artistsA.has(x.toLowerCase()))
  const genres  = sb.genres.filter(x => genresA.has(x.toLowerCase()))

  return { artists, genres }
}

export function proximityScore(a: User, b: User): { score: number; overlap: { artists: string[]; genres: string[] } } {
  const overlap = spotifyOverlap(a, b)
  if (!mutuallyCompatible(a, b)) return { score: 0, overlap }

  let score = 1 // baseline
  if (a.campus && b.campus && a.campus === b.campus) score += 1

  // Spotify boost: +2 per shared artist (max 6), +1 per shared genre (max 3)
  score += Math.min(overlap.artists.length * 2, 6)
  score += Math.min(overlap.genres.length, 3)

  return { score, overlap }
}

export function buildFeed(
  currentUser: User,
  others: User[],
  swipedIds: Set<string>,
  admiredByIds: Set<string> = new Set(),
  totalUserCount?: number
): FeedCard[] {
  const tinyPool = (totalUserCount ?? others.length + 1) < 20

  return others
    .filter((u) => !swipedIds.has(u.id))
    .map((u) => {
      const { score: base, overlap } = tinyPool
        ? { score: 1, overlap: spotifyOverlap(currentUser, u) }
        : proximityScore(currentUser, u)
      return {
        user: u,
        score: base,
        hint: buildHint(currentUser, u, overlap),
      }
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
}

function buildHint(a: User, b: User, overlap: { artists: string[]; genres: string[] }): string {
  // Spotify match takes priority
  if (overlap.artists.length > 0) {
    const names = overlap.artists.slice(0, 2).join(' & ')
    return `you both fw ${names} 🎵`
  }
  if (overlap.genres.length > 0) {
    const g = overlap.genres.slice(0, 2).join(' & ')
    return `shared taste in ${g} 🎵`
  }
  if (a.campus && b.campus && a.campus === b.campus) return 'y\'all are literally on the same campus'
  return 'you two have probably crossed paths ngl'
}
