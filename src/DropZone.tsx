import { useState, type DragEvent, type ChangeEvent } from "react";

export default function PdfDropZoneLabel(props: {
  setFile: (f: File) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (
      f &&
      (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))
    ) {
      props.setFile(f);
    } else if (f) {
      alert("Please select a PDF file");
    }
    e.currentTarget.value = "";
  }

  function handleDragOver(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(true);
  }
  function handleDragLeave(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(false);
  }
  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(false);
    const f = (e.dataTransfer.files && e.dataTransfer.files[0]) || null;
    if (
      f &&
      (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))
    ) {
      props.setFile(f);
    } else if (f) {
      alert("Please drop a PDF file");
    }
    e.dataTransfer.clearData();
  }

  return (
    <label
      htmlFor="pdf-input"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`block border-2 border-dashed rounded-lg p-18 text-center cursor-pointer bg-white ${
        isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300"
      }`}
    >
      <input
        id="pdf-input"
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleInputChange}
      />
      <p>Click to select or drag & drop a PDF</p>
    </label>
  );
}
