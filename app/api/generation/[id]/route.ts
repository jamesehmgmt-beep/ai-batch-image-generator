import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// DELETE a generation (soft delete with atomic counter update)
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Generation ID is required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Check the generation exists and get its state
    const { data: existing, error: fetchError } = await supabase
      .from('generations')
      .select('state, job_id, deleted_at')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { success: false, error: 'Generation not found' },
        { status: 404 }
      );
    }

    // Check if already deleted
    if (existing.deleted_at) {
      return NextResponse.json(
        { success: false, error: 'Generation already deleted' },
        { status: 400 }
      );
    }

    // Soft delete the generation (works for all states)
    const { error: deleteError } = await supabase
      .from('generations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting generation:', deleteError);
      return NextResponse.json(
        { success: false, error: 'Failed to delete generation' },
        { status: 500 }
      );
    }

    // Only decrement counter if generation was completed
    if (existing.state === 'completed') {
      const { error: rpcError } = await supabase.rpc('decrement_job_generation_count', {
        p_job_id: existing.job_id
      });
      if (rpcError) {
        console.error('Error decrementing count:', rpcError);
        // Don't fail request - deletion succeeded
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Generation deleted',
    });
  } catch (error) {
    console.error('Error in generation delete endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    // console.log('[Generation PATCH] Request for ID:', id);

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Generation ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    // console.log('[Generation PATCH] Request body:', JSON.stringify(body, null, 2));
    const { operation, prompt, referenceImageUrls, resolution, aspectRatio, photoMode, model, quality, imageSize } = body;

    const supabase = createServerSupabaseClient();

    // First check the generation exists and is in pending state
    const { data: existing, error: fetchError } = await supabase
      .from('generations')
      .select('state')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      console.error('[Generation PATCH] Generation not found:', id, fetchError);
      return NextResponse.json(
        { success: false, error: 'Generation not found' },
        { status: 404 }
      );
    }

    // console.log('[Generation PATCH] Found generation with state:', existing.state);

    if (existing.state !== 'pending') {
      return NextResponse.json(
        { success: false, error: `Can only edit pending generations (current state: ${existing.state})` },
        { status: 400 }
      );
    }

    // Build update object with only provided fields
    // Only include non-null values to avoid issues with columns that may not exist
    const updates: Record<string, unknown> = {};
    if (operation !== undefined && operation !== null) updates.operation = operation;
    if (prompt !== undefined && prompt !== null) updates.prompt = prompt;
    if (referenceImageUrls !== undefined && referenceImageUrls !== null) updates.reference_image_urls = referenceImageUrls;
    if (resolution !== undefined && resolution !== null) updates.resolution = resolution;
    if (aspectRatio !== undefined && aspectRatio !== null) updates.aspect_ratio = aspectRatio;
    if (photoMode !== undefined && photoMode !== null) updates.photo_mode = photoMode;
    if (model !== undefined && model !== null) updates.model = model;
    // Only include Seedream fields if they have actual values (not null)
    if (quality !== undefined && quality !== null) updates.quality = quality;
    if (imageSize !== undefined && imageSize !== null) updates.image_size = imageSize;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No updates provided' },
        { status: 400 }
      );
    }

    // console.log('[Generation PATCH] Updating generation:', id, 'with:', updates);

    // Update the generation
    const { data: updated, error: updateError } = await supabase
      .from('generations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[Generation PATCH] Supabase update error:', updateError);
      return NextResponse.json(
        { success: false, error: `Failed to update generation: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      generation: {
        id: updated.id,
        operation: updated.operation,
        prompt: updated.prompt,
        referenceImageUrls: updated.reference_image_urls,
        resolution: updated.resolution,
        aspectRatio: updated.aspect_ratio,
        photoMode: updated.photo_mode,
        model: updated.model,
        quality: updated.quality,
        imageSize: updated.image_size,
      },
    });
  } catch (error) {
    console.error('Error in generation update endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
