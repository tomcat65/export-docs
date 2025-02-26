export default function ClientsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="container py-8">
      {children}
    </div>
  )
} 