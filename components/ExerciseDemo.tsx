'use client'

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default function ExerciseDemo({ name }: { name: string }) {
  const url = `https://musclewiki.com/exercise/${slugify(name)}`

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="shrink-0 text-zinc-700 hover:text-zinc-400 transition-colors text-[10px]"
      title="How to perform"
      onClick={(e) => e.stopPropagation()}
    >
      ↗
    </a>
  )
}
