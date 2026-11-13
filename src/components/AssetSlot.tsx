import { useId, useState, type DragEvent } from 'react';

export interface SlotValue {
  blob: Blob;
  name: string;
  url: string;
}

interface Props {
  index: number;
  title: string;
  hint: string;
  accept: string;
  value: SlotValue | null;
  checker?: boolean;
  onChange: (file: File) => void;
}

export function AssetSlot({ index, title, hint, accept, value, checker, onChange }: Props) {
  const id = useId();
  const [over, setOver] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onChange(file);
  };

  return (
    <label
      htmlFor={id}
      className={`slot${over ? ' slot--over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <div className={`slot__thumb${checker ? ' slot__thumb--checker' : ''}`}>
        {value ? <img src={value.url} alt="" /> : <span className="slot__num">{index}</span>}
      </div>
      <div className="slot__body">
        <div className="slot__title">{title}</div>
        <div className="slot__name">{value ? value.name : 'Choose or drop a file'}</div>
        <div className="slot__hint">{hint}</div>
      </div>
      <input
        id={id}
        type="file"
        accept={accept}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onChange(file);
          e.target.value = '';
        }}
      />
    </label>
  );
}
