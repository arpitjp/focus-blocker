#!/usr/bin/env python3
"""
Resize the provided icon image to required Chrome extension sizes.
Requires Pillow: pip install Pillow
"""

try:
    from PIL import Image
    import os
    
    # Look for source icon - could be various names
    source_files = ['icon_source.png', 'icon.png', 'source_icon.png', 'icon128.png']
    source_image = None
    
    for f in source_files:
        if os.path.exists(f):
            source_image = f
            break
    
    if source_image is None:
        print("No source image found. Please save your icon as 'icon_source.png'")
        exit(1)
    
    print(f"Using source image: {source_image}")
    
    # Open the source image
    img = Image.open(source_image)
    
    # Convert to RGBA if necessary
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # Resize to required sizes
    sizes = [16, 48, 128]
    
    for size in sizes:
        # Use high-quality resampling
        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(f'icon{size}.png', 'PNG')
        print(f'Created icon{size}.png ({size}x{size})')
    
    print('\n✅ Icons created successfully!')
    print('Reload the extension in chrome://extensions/ to see the new icons.')
    
except ImportError:
    print("Pillow is not installed. Installing...")
    import subprocess
    import sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    print("Please run this script again.")
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
