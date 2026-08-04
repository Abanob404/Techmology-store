import os

files = ['index.html', 'products.html', 'services.html']

for f in files:
    if not os.path.exists(f): continue
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Fix Header Logo
    content = content.replace('class="h-10 w-auto object-contain"', 'class="h-12 md:h-16 w-auto max-w-[200px] object-contain"')
    
    # Fix Footer Logo
    content = content.replace('class="h-10 md:h-14 object-contain origin-right"', 'class="h-14 md:h-20 w-auto max-w-[250px] object-contain origin-right"')
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)
    print(f'Processed {f}')
