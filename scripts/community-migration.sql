-- 1. Add is_public column to content_items table
ALTER TABLE public.content_items 
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

-- 2. Allow anyone to read public items
CREATE POLICY "Allow public read access for community items" 
ON public.content_items 
FOR SELECT 
USING (is_public = true);

-- 3. Allow admin to update any item (since you are using miabhisu@gmail.com as admin)
CREATE POLICY "Admin full access"
ON public.content_items
FOR ALL
TO authenticated
USING (auth.jwt() ->> 'email' = 'miabhisu@gmail.com');

-- (Users already have a policy to UPDATE their own items, so they can toggle is_public for themselves)
