'use client'

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default function ExerciseDemo({ name }: { name: string }) {
  const url = `https://musclewiki.com/exercise/${slugify(name)}`

  const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(`how to ${name}`)}`

  return (
    <span className="flex items-center gap-1">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-zinc-700 hover:text-zinc-400 transition-colors text-[10px]"
        title="How to perform (musclewiki)"
        onClick={(e) => e.stopPropagation()}
      >
        ↗
      </a>
      <a
        href={youtubeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-zinc-700 hover:text-red-500 transition-colors text-[10px]"
        title="Search on YouTube"
        onClick={(e) => e.stopPropagation()}
      >
        ▶
      </a>
    </span>
  )
}
