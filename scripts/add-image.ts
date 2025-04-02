import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fetch from 'node-fetch';
import inquirer from 'inquirer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function downloadImage(url: string, outputPath: string): Promise<void> {
  try {
    // Add headers to mimic a browser request
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': new URL(url).origin,
      'Cache-Control': 'no-cache'
    };

    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      // More detailed error message
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}
      URL: ${url}
      Headers: ${JSON.stringify(response.headers.raw(), null, 2)}`);
    }

    // Verify content type
    const contentType = response.headers.get('content-type');
    if (!contentType?.startsWith('image/')) {
      throw new Error(`Invalid content type: ${contentType}. Expected an image.`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    
    // Verify we got actual data
    if (buffer.length === 0) {
      throw new Error('Downloaded file is empty');
    }

    // Create directory if it doesn't exist
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    await fs.writeFile(outputPath, buffer);
    console.log(`- Successfully downloaded image to: ${outputPath}`);
    console.log(`- File size: ${(buffer.length / 1024).toFixed(2)} KB`);
  } catch (error) {
    if (error instanceof Error) {
      // Check for specific error types
      if (error.message.includes('ENOTFOUND')) {
        console.error('❌ Could not resolve the host. Please check your internet connection and the URL.');
      } else if (error.message.includes('Unauthorized')) {
        console.error('❌ Access denied. This might be because:');
        console.error('   1. The image requires authentication');
        console.error('   2. The server is blocking direct downloads');
        console.error('   3. The image URL might be temporary or expired');
        console.error('\n💡 Try downloading the image manually and using a local path instead.');
      } else {
        console.error('❌ Error downloading image:', error.message);
      }
    }
    throw error;
  }
}

async function getCurrentPostFolder(): Promise<string> {
  try {
    const cwd = process.cwd();
    
    // First check if we're in a post folder
    const isInPostFolder = await fs.stat(path.join(cwd, 'index.md'))
      .then(() => true)
      .catch(() => false);

    if (isInPostFolder) {
      return cwd;
    }

    // Look for posts directory in common locations
    const possiblePostsDirs = [
      path.join(cwd, 'src', 'content', 'posts'),
      path.join(cwd, 'content', 'posts'),
      path.join(cwd, 'posts'),
    ];

    let postsDir = '';
    for (const dir of possiblePostsDirs) {
      try {
        await fs.access(dir);
        postsDir = dir;
        break;
      } catch {}
    }

    if (!postsDir) {
      throw new Error('Could not find posts directory');
    }

    // Get all items in the directory
    const items = await fs.readdir(postsDir);
    
    // Filter for directories only
    const posts = await Promise.all(
      items.map(async (item) => {
        const fullPath = path.join(postsDir, item);
        const stats = await fs.stat(fullPath);
        return stats.isDirectory() ? item : null;
      })
    );
    
    // Filter out null values and add current folder
    const validPosts = posts.filter((post): post is string => post !== null);
    console.log(postsDir)
    const { selectedPost } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedPost',
        message: 'Select the post folder to store image',
        choices: [
          { name: 'src/content/posts', value: './' },
          ...validPosts.map(post => ({ name: `src/content/posts/${post}`, value: post }))
        ]
      }
    ]);

    // Handle current folder selection
    if (selectedPost === '.') {
      return cwd;
    }

    return path.join(postsDir, selectedPost);
  } catch (error) {
    console.error('❌ Error finding post folder:', error);
    throw error;
  }
}

async function main() {
  try {
    // Get image URL or local path from user
    const { imageSource } = await inquirer.prompt([
      {
        type: 'input',
        name: 'imageSource',
        message: 'Enter the image URL or local path:',
        validate: (input: string) => {
          if (!input) return 'Please enter a URL or path';
          // Allow both URLs and local paths
          try {
            new URL(input);
            return true;
          } catch {
            // If not a URL, check if it's a valid path
            return path.isAbsolute(input) || input.startsWith('./') || input.startsWith('../') || true;
          }
        }
      }
    ]);

    const postFolder = await getCurrentPostFolder();
    const imageDir = postFolder

    // Handle both URLs and local paths
    let filename: string;
    if (imageSource.startsWith('http')) {
      // For URLs
      filename = path.basename(new URL(imageSource).pathname);
      if (!path.extname(filename)) {
        const { customFilename } = await inquirer.prompt([
          {
            type: 'input',
            name: 'customFilename',
            message: 'Enter filename e.g. image.png:',
            default: 'image.png',
            validate: (input: string) => {
              return path.extname(input) ? true : 'Please include a file extension e.g., .png, .jpg, .jpeg';
            }
          }
        ]);
        filename = customFilename;
      }
      
      const outputPath = path.join(imageDir, filename);
      await downloadImage(imageSource, outputPath);
    } else {
      // For local paths
      try {
        const sourcePath = path.resolve(process.cwd(), imageSource);
        filename = path.basename(sourcePath);
        const outputPath = path.join(imageDir, filename);
        
        await fs.mkdir(imageDir, { recursive: true });
        await fs.copyFile(sourcePath, outputPath);
        console.log(`✅ Successfully copied image to: ${outputPath}`);
      } catch (error) {
        console.error('❌ Error copying local file:', error);
        throw error;
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();