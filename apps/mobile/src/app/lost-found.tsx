import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, Input, MediaPreview, MutedText, PrimaryButton, QueryState, Screen, SectionTitle, SecondaryButton, TextArea } from "@/components/ui";
import { pickImagesFromLibrary } from "@/lib/media-picker";
import { localeTag, localizeLostFoundStatus } from "@/lib/mobile-format";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

type LostFoundComment = {
  id: string;
  text: string;
  created_at: string;
};

type LostFoundMedia = {
  id: string;
  media_url: string;
  media_mime: string;
};

type LostFoundItem = {
  id: string;
  title: string;
  description: string;
  status: string;
  found_location?: string | null;
  category?: string | null;
  contact_note?: string | null;
  comments?: LostFoundComment[];
  media?: LostFoundMedia[];
};

type PendingPhoto = {
  uri: string;
  name: string;
  mimeType?: string | null;
};

const SUPPORTED_PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export default function LostFoundScreen() {
  const { authorizedRequest, selectedBranchId } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const locale = localeTag(isRTL);
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<"LOST" | "FOUND">("LOST");
  const [foundLocation, setFoundLocation] = useState("");
  const [contactNote, setContactNote] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);

  const itemsQuery = useQuery({
    queryKey: ["mobile-lost-found", selectedBranchId],
    queryFn: async () => {
      const suffix = selectedBranchId ? `?branch_id=${encodeURIComponent(selectedBranchId)}` : "";
      return (await authorizedRequest<LostFoundItem[]>(`/mobile/lost-found/items${suffix}`)).data;
    },
  });
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const selectedItem = useMemo(() => items.find((item) => item.id === selectedItemId) ?? items[0] ?? null, [items, selectedItemId]);

  const itemDetailQuery = useQuery({
    queryKey: ["mobile-lost-found-detail", selectedItem?.id, selectedBranchId ?? "all"],
    enabled: Boolean(selectedItem?.id),
    queryFn: async () => (await authorizedRequest<LostFoundItem>(`/mobile/lost-found/items/${selectedItem?.id}`)).data,
  });

  async function uploadItemPhoto(itemId: string, photo: PendingPhoto) {
    const formData = new FormData();
    formData.append("file", {
      uri: photo.uri,
      name: photo.name,
      type: photo.mimeType ?? "image/jpeg",
    } as never);
    return authorizedRequest(`/mobile/lost-found/items/${itemId}/media`, {
      method: "POST",
      body: formData,
    });
  }

  async function pickPhotos() {
    const photos = await pickImagesFromLibrary({ multiple: true, permissionDeniedMessage: copy.common.photoPermissionDenied });
    const unsupported = photos.find((photo) => !SUPPORTED_PHOTO_MIME_TYPES.has((photo.mimeType ?? "").toLowerCase()));
    if (unsupported) {
      setFeedback(copy.lostFoundScreen.unsupportedPhoto);
      return;
    }
    setPendingPhotos((current) => [...current, ...photos]);
  }

  const createItemMutation = useMutation({
    mutationFn: async () => {
      const unsupported = pendingPhotos.find((photo) => !SUPPORTED_PHOTO_MIME_TYPES.has((photo.mimeType ?? "").toLowerCase()));
      if (unsupported) {
        throw new Error(copy.lostFoundScreen.unsupportedPhoto);
      }
      const createPath = selectedBranchId
        ? `/mobile/lost-found/items?branch_id=${encodeURIComponent(selectedBranchId)}`
        : "/mobile/lost-found/items";
      const created = await authorizedRequest(createPath, {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          category,
          found_location: foundLocation || null,
          contact_note: contactNote || null,
        }),
      });
      const data = created.data as { id: string };
      for (const photo of pendingPhotos) {
        await uploadItemPhoto(data.id, photo);
      }
      return created;
    },
    onSuccess: async (payload) => {
      setTitle("");
      setDescription("");
      setCategory("LOST");
      setFoundLocation("");
      setContactNote("");
      setPendingPhotos([]);
      setFeedback(copy.common.successUpdated);
      const data = payload.data as { id: string };
      setSelectedItemId(data.id);
      await queryClient.invalidateQueries({ queryKey: ["mobile-lost-found"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-lost-found-detail", data.id] });
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  const commentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedItem) {
        throw new Error(copy.lostFoundScreen.noItems);
      }
      return authorizedRequest(`/mobile/lost-found/items/${selectedItem.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ text: comment }),
      });
    },
    onSuccess: async () => {
      setComment("");
      setFeedback(copy.common.successUpdated);
      await queryClient.invalidateQueries({ queryKey: ["mobile-lost-found-detail", selectedItem?.id] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-lost-found"] });
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  const mediaMutation = useMutation({
    mutationFn: async () => {
      if (!selectedItem) {
        throw new Error(copy.lostFoundScreen.noItems);
      }
      const [asset] = await pickImagesFromLibrary({ permissionDeniedMessage: copy.common.photoPermissionDenied });
      if (!asset) {
        return null;
      }
      return uploadItemPhoto(selectedItem.id, {
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
      });
    },
    onSuccess: async (payload) => {
      if (!payload) {
        return;
      }
      setFeedback(copy.common.successUpdated);
      await queryClient.invalidateQueries({ queryKey: ["mobile-lost-found-detail", selectedItem?.id] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-lost-found"] });
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  const detail = itemDetailQuery.data ?? selectedItem;
  const categoryLabel = (value?: string | null) => {
    if (value === "LOST") {
      return copy.lostFoundScreen.lostCategory;
    }
    if (value === "FOUND") {
      return copy.lostFoundScreen.foundCategory;
    }
    return value || "--";
  };

  return (
    <Screen title={copy.common.lostFound} subtitle={copy.lostFoundScreen.subtitle}>
      <Card>
        <SectionTitle>{copy.lostFoundScreen.createItem}</SectionTitle>
        <Input value={title} onChangeText={setTitle} placeholder={copy.lostFoundScreen.title} />
        <View style={[styles.categoryPicker, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <CategoryChip label={copy.lostFoundScreen.lostCategory} active={category === "LOST"} onPress={() => setCategory("LOST")} />
          <CategoryChip label={copy.lostFoundScreen.foundCategory} active={category === "FOUND"} onPress={() => setCategory("FOUND")} />
        </View>
        <TextArea value={description} onChangeText={setDescription} placeholder={copy.lostFoundScreen.description} />
        <Input value={foundLocation} onChangeText={setFoundLocation} placeholder={copy.lostFoundScreen.foundLocation} />
        <Input value={contactNote} onChangeText={setContactNote} placeholder={copy.lostFoundScreen.contactNote} />
        <MutedText>{copy.lostFoundScreen.photoHint}</MutedText>
        {pendingPhotos.length ? (
          <View style={styles.photoList}>
            {pendingPhotos.map((photo) => (
              <MediaPreview key={photo.uri} uri={photo.uri} mime={photo.mimeType} label={photo.name} />
            ))}
          </View>
        ) : null}
        <SecondaryButton onPress={() => void pickPhotos()} disabled={createItemMutation.isPending}>
          {copy.lostFoundScreen.addPhotosToReport}
        </SecondaryButton>
        <PrimaryButton onPress={() => createItemMutation.mutate()} disabled={createItemMutation.isPending || !title.trim() || !description.trim()}>
          {createItemMutation.isPending ? (pendingPhotos.length ? copy.lostFoundScreen.uploadingPhotos : copy.lostFoundScreen.createItemBusy) : copy.lostFoundScreen.createItem}
        </PrimaryButton>
      </Card>

      <QueryState
        loading={itemsQuery.isLoading}
        error={itemsQuery.error instanceof Error ? itemsQuery.error.message : null}
        empty={!itemsQuery.isLoading && items.length === 0}
        emptyMessage={copy.lostFoundScreen.noItems}
      />

      {items.length > 0 ? (
        <>
          <Card>
            <SectionTitle>{copy.common.lostFound}</SectionTitle>
            {items.map((item) => {
              const active = detail?.id === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setSelectedItemId(item.id)}
                  style={[styles.itemRow, { borderTopColor: theme.border, backgroundColor: active ? theme.cardAlt : "transparent", borderColor: active ? theme.primary : theme.border }]}
                >
                  <View style={[styles.itemHead, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <Text style={[styles.itemTitle, { color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                      {item.title}
                    </Text>
                    <Text style={{ color: theme.primary, fontFamily: fontSet.mono, fontSize: 11, fontWeight: "800" }}>
                      {localizeLostFoundStatus(item.status, isRTL)}
                    </Text>
                  </View>
                  <MutedText>{categoryLabel(item.category)}</MutedText>
                </Pressable>
              );
            })}
          </Card>

          {detail ? (
            <Card>
              <SectionTitle>{detail.title}</SectionTitle>
              <MutedText>{localizeLostFoundStatus(detail.status, isRTL)}</MutedText>
              <MutedText>{categoryLabel(detail.category)}</MutedText>
              <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                {detail.description}
              </Text>
              <MutedText>{detail.found_location || copy.common.noLocationAdded}</MutedText>
              {detail.contact_note ? <MutedText>{detail.contact_note}</MutedText> : null}

              <SectionTitle>{copy.lostFoundScreen.photos}</SectionTitle>
              {detail.media?.length ? detail.media.map((item) => (
                <MediaPreview key={item.id} uri={item.media_url} mime={item.media_mime} label={copy.lostFoundScreen.photos} />
              )) : <MutedText>{copy.lostFoundScreen.noPhotos}</MutedText>}
              <SecondaryButton onPress={() => mediaMutation.mutate()} disabled={mediaMutation.isPending}>
                {mediaMutation.isPending ? copy.lostFoundScreen.uploadingPhotos : copy.lostFoundScreen.addPhotos}
              </SecondaryButton>

              <SectionTitle>{copy.lostFoundScreen.itemComments}</SectionTitle>
              {detail.comments?.map((item) => (
                <View key={item.id} style={[styles.commentRow, { borderTopColor: theme.border, backgroundColor: theme.cardAlt }]}>
                  <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                    {item.text}
                  </Text>
                  <MutedText>{new Date(item.created_at).toLocaleString(locale)}</MutedText>
                </View>
              ))}
              <TextArea value={comment} onChangeText={setComment} placeholder={copy.lostFoundScreen.commentPlaceholder} />
              <PrimaryButton onPress={() => commentMutation.mutate()} disabled={commentMutation.isPending || !comment.trim()}>
                {commentMutation.isPending ? copy.lostFoundScreen.commentBusy : copy.lostFoundScreen.addComment}
              </PrimaryButton>
            </Card>
          ) : null}
        </>
      ) : null}

      {feedback ? (
        <Card>
          <MutedText>{feedback}</MutedText>
        </Card>
      ) : null}
    </Screen>
  );
}

function CategoryChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { fontSet, theme } = usePreferences();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.categoryChip,
        {
          backgroundColor: active ? theme.primary : theme.cardAlt,
          borderColor: active ? theme.primary : theme.border,
        },
      ]}
    >
      <Text style={[styles.categoryChipText, { color: active ? "#FFFFFF" : theme.foreground, fontFamily: fontSet.body }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  categoryPicker: {
    gap: 10,
  },
  categoryChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  categoryChipText: {
    fontSize: 14,
    fontWeight: "800",
  },
  itemRow: {
    gap: 4,
    borderTopWidth: 1,
    borderWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderRadius: 10,
  },
  itemHead: {
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },
  itemTitle: {
    flex: 1,
  },
  commentRow: {
    gap: 4,
    borderTopWidth: 1,
    paddingTop: 10,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  photoList: {
    gap: 10,
  },
});
