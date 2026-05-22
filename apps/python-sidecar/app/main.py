import asyncio
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

app = FastAPI(title="StitchToon Slicing Service")

class SliceRequest(BaseModel):
  input_path: str = Field(..., description="Absolute path to input image file, directory, or zip")
  output_path: str = Field(..., description="Absolute path to output directory")
  method: str = Field("pixel", description="Slice detection method (pixel or direct)")
  height: int = Field(2000, description="Target slice height in pixels")
  width: Optional[int] = Field(None, description="Normalize width before processing")
  sensitivity: int = Field(90, ge=1, le=100, description="Detection accuracy (1-100)")
  max_height: int = Field(-1, description="Maximum slice height (-1 for no limit)")
  min_height: int = Field(-1, description="Minimum slice height (-1 for no limit)")
  division_factor: int = Field(1, ge=1, le=5, description="Downscale factor (1-5)")
  window: int = Field(1, ge=1, description="Consecutive rows (default 1)")
  img_format: str = Field("png", description="Output format (png, jpeg, webp)")

@app.post("/slice")
async def slice_images(req: SliceRequest):
  if not os.path.exists(req.input_path):
    raise HTTPException(status_code=400, detail=f"Input path does not exist: {req.input_path}")

  # Ensure output directory exists
  os.makedirs(req.output_path, exist_ok=True)

  # Resolve path to stitchtoon executable in the virtual environment
  venv_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
  stitchtoon_exe = os.path.join(venv_dir, ".venv", "Scripts", "stitchtoon.exe")
  if not os.path.exists(stitchtoon_exe):
    # Fallback to system path if not found in virtual environment Scripts
    stitchtoon_exe = "stitchtoon"

  # Construct command arguments
  cmd = [
    stitchtoon_exe,
    "--no-progress",
    "-f", req.img_format,
    "-m", req.method,
    "-H", str(req.height),
    "--sensitivity", str(req.sensitivity),
    "--max-height", str(req.max_height),
    "--min-height", str(req.min_height),
    "--division-factor", str(req.division_factor),
    "--window", str(req.window)
  ]

  if req.width is not None:
    cmd.extend(["--width", str(req.width)])

  # Append positional args
  cmd.extend([req.input_path, req.output_path])

  print(f"Executing StitchToon command: {' '.join(cmd)}")

  # Run stitchtoon asynchronously
  process = await asyncio.create_subprocess_exec(
    *cmd,
    stdout=asyncio.subprocess.PIPE,
    stderr=asyncio.subprocess.PIPE
  )

  stdout, stderr = await process.communicate()

  if process.returncode != 0:
    error_msg = stderr.decode().strip() or stdout.decode().strip()
    print(f"StitchToon failed with exit code {process.returncode}. Error: {error_msg}")
    raise HTTPException(status_code=500, detail=f"StitchToon error: {error_msg}")

  print("StitchToon slicing completed successfully.")
  return {
    "status": "success",
    "message": "Slicing completed successfully",
    "output_path": req.output_path
  }

@app.get("/health")
async def health():
  return {"status": "ok"}

from PIL import Image

class CropRequest(BaseModel):
  image_path: str
  output_path: str
  x: int
  y: int
  width: int
  height: int

@app.post("/crop")
async def crop_image(req: CropRequest):
  if not os.path.exists(req.image_path):
    raise HTTPException(status_code=400, detail=f"Image path does not exist: {req.image_path}")

  try:
    os.makedirs(os.path.dirname(req.output_path), exist_ok=True)
    with Image.open(req.image_path) as img:
      # Crop box format in Pillow: (left, upper, right, lower)
      cropped = img.crop((req.x, req.y, req.x + req.width, req.y + req.height))
      cropped.save(req.output_path)

    return {
      "status": "success",
      "message": "Image cropped successfully",
      "output_path": req.output_path,
      "width": req.width,
      "height": req.height
    }
  except Exception as e:
    raise HTTPException(status_code=500, detail=f"Failed to crop image: {str(e)}")

class SplitRequest(BaseModel):
  image_path: str
  split_y: int
  output_dir: str

@app.post("/split")
async def split_image(req: SplitRequest):
  if not os.path.exists(req.image_path):
    raise HTTPException(status_code=400, detail=f"Image path does not exist: {req.image_path}")

  try:
    os.makedirs(req.output_dir, exist_ok=True)
    base_name = os.path.basename(req.image_path)
    name_part, ext = os.path.splitext(base_name)
    if not ext:
      ext = ".png"

    import time
    suffix = int(time.time() * 1000)
    out1_name = f"{name_part}_s1_{suffix}{ext}"
    out2_name = f"{name_part}_s2_{suffix}{ext}"

    out1_path = os.path.join(req.output_dir, out1_name)
    out2_path = os.path.join(req.output_dir, out2_name)

    with Image.open(req.image_path) as img:
      w, h = img.size
      if req.split_y <= 0 or req.split_y >= h:
        raise HTTPException(status_code=400, detail=f"Split Y ({req.split_y}) must be between 0 and image height ({h})")

      upper = img.crop((0, 0, w, req.split_y))
      lower = img.crop((0, req.split_y, w, h))

      upper.save(out1_path)
      lower.save(out2_path)

      w1, h1 = upper.size
      w2, h2 = lower.size

    return {
      "status": "success",
      "parts": [
        {"filename": out1_name, "width": w1, "height": h1},
        {"filename": out2_name, "width": w2, "height": h2}
      ]
    }
  except HTTPException:
    raise
  except Exception as e:
    raise HTTPException(status_code=500, detail=f"Failed to split image: {str(e)}")

class MergeRequest(BaseModel):
  image_paths: list[str]
  output_path: str

@app.post("/merge")
async def merge_images(req: MergeRequest):
  if not req.image_paths:
    raise HTTPException(status_code=400, detail="No image paths provided for merge")

  for path in req.image_paths:
    if not os.path.exists(path):
      raise HTTPException(status_code=400, detail=f"Image path does not exist: {path}")

  try:
    os.makedirs(os.path.dirname(req.output_path), exist_ok=True)
    images = [Image.open(path) for path in req.image_paths]

    target_width = images[0].width
    resized_images = []
    total_height = 0

    for img in images:
      if img.width != target_width:
        scale = target_width / img.width
        new_height = int(img.height * scale)
        resample_filter = getattr(Image, "Resampling", Image).LANCZOS
        resized = img.resize((target_width, new_height), resample_filter)
        resized_images.append(resized)
        total_height += new_height
      else:
        resized_images.append(img)
        total_height += img.height

    # Create merged image
    merged_img = Image.new("RGBA" if any(img.mode == "RGBA" for img in resized_images) else "RGB", (target_width, total_height))
    current_y = 0
    for img in resized_images:
      merged_img.paste(img, (0, current_y))
      current_y += img.height

    merged_img.save(req.output_path)

    for img in images:
      img.close()

    return {
      "status": "success",
      "output_path": req.output_path,
      "width": target_width,
      "height": total_height
    }
  except Exception as e:
    raise HTTPException(status_code=500, detail=f"Failed to merge images: {str(e)}")

