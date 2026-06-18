import * as React from "react"
import { cn } from "@/lib/utils"

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-xl bg-white border border-gray-100 shadow-sm overflow-hidden", className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col space-y-1 px-5 pt-4 pb-2", className)} {...props} />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p className={cn("font-semibold text-gray-800 leading-none", className)} {...props} />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-5 pb-5", className)} {...props} />
}

export { Card, CardHeader, CardTitle, CardContent }
