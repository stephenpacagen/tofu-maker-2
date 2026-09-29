"use client";

import { useRef, useState, type ReactNode } from "react";

const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

export function DropZone({
  onFiles,
  className = "",
  children,
}: {
  onFiles: (files: FileList) => void;
  className?: string;
  children: ReactNode;
}) {
  const [active, setActive] = useState(false);
  // dragenter/dragleave also fire when crossing child elements, so track nesting depth.
  const depth = useRef(0);

  return (
    <div
      className={`rounded-xl transition-colors ${active ? "bg-zinc-100 ring-2 ring-brand ring-offset-4" : ""} ${className}`}
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setActive(true);
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setActive(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setActive(false);
        if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
      }}
    >
      {children}
    </div>
  );
}
